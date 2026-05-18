"use client"

import { useEffect, useRef } from "react"

interface Ring {
  x: number
  y: number
  r: number
  maxR: number
  alpha: number
  speed: number
  born: number
}

export default function Ripples() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999, moving: false })
  const ringsRef = useRef<Ring[]>([])
  const animRef = useRef<number>(0)
  const lastSpawnRef = useRef(0)
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const spawnRing = (x: number, y: number, speed = 1.5, maxR?: number) => {
      ringsRef.current.push({
        x,
        y,
        r: 2,
        maxR: maxR ?? Math.random() * 120 + 60,
        alpha: 0.7,
        speed,
        born: performance.now(),
      })
    }

    // ambient rings
    const spawnAmbient = () => {
      const x = Math.random() * canvas.width
      const y = Math.random() * canvas.height
      spawnRing(x, y, 0.8, 80)
    }

    const animate = (time: number) => {
      timeRef.current = time
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // spawn ambient ripple
      if (time - lastSpawnRef.current > 600) {
        spawnAmbient()
        lastSpawnRef.current = time
      }

      // spawn from mouse movement
      if (mouseRef.current.moving && time % 4 < 2) {
        spawnRing(mouseRef.current.x, mouseRef.current.y, 1.2, 50)
        mouseRef.current.moving = false
      }

      ringsRef.current = ringsRef.current.filter((ring) => ring.alpha > 0.01)

      for (const ring of ringsRef.current) {
        ring.r += ring.speed
        ring.alpha *= 0.97

        ctx.beginPath()
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(255,255,255,${ring.alpha})`
        ctx.lineWidth = 1.2
        ctx.stroke()

        // inner ring
        if (ring.r > 10) {
          ctx.beginPath()
          ctx.arc(ring.x, ring.y, ring.r * 0.6, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(255,255,255,${ring.alpha * 0.4})`
          ctx.lineWidth = 0.6
          ctx.stroke()
        }
      }

      animRef.current = requestAnimationFrame(animate)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY, moving: true }
    }
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999, moving: false }
    }
    const onClick = (e: MouseEvent) => {
      for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          spawnRing(e.clientX, e.clientY, 2 + i * 0.4, 100 + i * 40)
        }, i * 80)
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
