"use client"

import { useEffect, useRef } from "react"

interface Hex {
  cx: number
  cy: number
  size: number
  alpha: number
  targetAlpha: number
  pulseOffset: number
}

export default function HexPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const hexesRef = useRef<Hex[]>([])
  const animRef = useRef<number>(0)
  const clicksRef = useRef<{ x: number; y: number; t: number }[]>([])
  const timeRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const HEX_SIZE = 32

    const hexPath = (ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) => {
      ctx.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6
        const x = cx + r * Math.cos(angle)
        const y = cy + r * Math.sin(angle)
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      }
      ctx.closePath()
    }

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      initHexes()
    }

    const initHexes = () => {
      hexesRef.current = []
      const w = HEX_SIZE * 2
      const h = Math.sqrt(3) * HEX_SIZE
      const cols = Math.ceil(canvas.width / (w * 0.75)) + 2
      const rows = Math.ceil(canvas.height / h) + 2
      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          const cx = c * w * 0.75
          const cy = r * h + (c % 2 === 0 ? 0 : h / 2)
          hexesRef.current.push({
            cx,
            cy,
            size: HEX_SIZE - 2,
            alpha: 0,
            targetAlpha: 0,
            pulseOffset: Math.random() * Math.PI * 2,
          })
        }
      }
    }

    const animate = (time: number) => {
      timeRef.current = time
      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const t = time * 0.001
      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (const hex of hexesRef.current) {
        const dx = hex.cx - mx
        const dy = hex.cy - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        const mouseInfluence = Math.max(0, 1 - dist / 200)

        // click wave
        let clickInfluence = 0
        for (const click of clicksRef.current) {
          const cdx = hex.cx - click.x
          const cdy = hex.cy - click.y
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy)
          const age = (time - click.t) * 0.001
          const waveR = age * 300
          const diff = Math.abs(cdist - waveR)
          if (diff < 50) {
            clickInfluence = Math.max(
              clickInfluence,
              (1 - diff / 50) * Math.exp(-age * 0.6) * 0.9
            )
          }
        }

        const ambientPulse = (Math.sin(t * 0.8 + hex.pulseOffset) + 1) / 2
        hex.targetAlpha = Math.max(ambientPulse * 0.08, mouseInfluence * 0.85 + clickInfluence)
        hex.alpha += (hex.targetAlpha - hex.alpha) * 0.08

        hexPath(ctx, hex.cx, hex.cy, hex.size)
        ctx.strokeStyle = `rgba(255,255,255,${hex.alpha})`
        ctx.lineWidth = 1
        ctx.stroke()

        // fill for high influence
        if (mouseInfluence > 0.3 || clickInfluence > 0.3) {
          hexPath(ctx, hex.cx, hex.cy, hex.size)
          ctx.fillStyle = `rgba(255,255,255,${Math.max(mouseInfluence, clickInfluence) * 0.08})`
          ctx.fill()
        }
      }

      clicksRef.current = clicksRef.current.filter((c) => time - c.t < 3000)

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
