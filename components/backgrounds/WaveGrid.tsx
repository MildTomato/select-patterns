"use client"

import { useEffect, useRef } from "react"

export default function WaveGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const animRef = useRef<number>(0)
  const clicksRef = useRef<{ x: number; y: number; t: number }[]>([])
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const SPACING = 40

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }

    const animate = (time: number) => {
      timeRef.current = time
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const t = time * 0.001
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      const cols = Math.ceil(canvas.width / SPACING) + 1
      const rows = Math.ceil(canvas.height / SPACING) + 1

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const bx = c * SPACING
          const by = r * SPACING

          // wave displacement
          const waveX =
            Math.sin((c * 0.3 + t) * 1.2) * 6 +
            Math.sin((r * 0.25 - t * 0.8) * 1.4) * 4
          const waveY =
            Math.cos((r * 0.3 + t * 0.9) * 1.2) * 6 +
            Math.cos((c * 0.25 + t * 1.1) * 1.4) * 4

          // click wave displacement
          let clickDX = 0
          let clickDY = 0
          for (const click of clicksRef.current) {
            const cdx = bx - click.x
            const cdy = by - click.y
            const dist = Math.sqrt(cdx * cdx + cdy * cdy)
            const age = (time - click.t) * 0.002
            const waveRadius = age * 200
            const diff = dist - waveRadius
            if (Math.abs(diff) < 60) {
              const influence = (1 - Math.abs(diff) / 60) * Math.exp(-age * 0.5) * 20
              clickDX += (cdx / (dist + 1)) * influence
              clickDY += (cdy / (dist + 1)) * influence
            }
          }

          const x = bx + waveX + clickDX
          const y = by + waveY + clickDY

          // mouse proximity
          const mdx = bx - mx
          const mdy = by - my
          const mdist = Math.sqrt(mdx * mdx + mdy * mdy)
          const mouseInfluence = Math.max(0, 1 - mdist / 160)

          const dotSize = 1.5 + mouseInfluence * 4
          const alpha = 0.2 + mouseInfluence * 0.7

          ctx.beginPath()
          ctx.arc(x, y, dotSize, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(255,255,255,${alpha})`
          ctx.fill()
        }
      }

      // clean old clicks
      clicksRef.current = clicksRef.current.filter((c) => time - c.t < 4000)

      animRef.current = requestAnimationFrame(animate)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }
    const onClick = (e: MouseEvent) => {
      clicksRef.current.push({ x: e.clientX, y: e.clientY, t: timeRef.current })
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
