"use client"

import { useEffect, useRef } from "react"

interface GridCell {
  row: number
  col: number
  x: number
  y: number
  state: number // 0 = off, 1 = on
  alpha: number
  targetAlpha: number
}

export default function BinaryPulse() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<GridCell[]>([])
  const animRef = useRef<number>(0)
  const timeRef = useRef(0)
  const clickWavesRef = useRef<{ x: number; y: number; t: number }[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const SIZE = 36
    let cols = 0
    let rows = 0

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      cols = Math.ceil(canvas.width / SIZE) + 1
      rows = Math.ceil(canvas.height / SIZE) + 1
      initCells()
    }

    const initCells = () => {
      cellsRef.current = []
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          cellsRef.current.push({
            row: r,
            col: c,
            x: c * SIZE + SIZE / 2,
            y: r * SIZE + SIZE / 2,
            state: Math.random() > 0.5 ? 1 : 0,
            alpha: 0,
            targetAlpha: 0,
          })
        }
      }
    }

    let lastFlip = 0

    const animate = (time: number) => {
      timeRef.current = time

      ctx.fillStyle = "#0a0a0a"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      // flip random cells
      if (time - lastFlip > 120) {
        const idx = Math.floor(Math.random() * cellsRef.current.length)
        cellsRef.current[idx].state = 1 - cellsRef.current[idx].state
        lastFlip = time
      }

      for (const cell of cellsRef.current) {
        const dx = cell.x - mx
        const dy = cell.y - my
        const dist = Math.sqrt(dx * dx + dy * dy)
        const mouseInfluence = Math.max(0, 1 - dist / 180)

        // click wave influence
        let waveInfluence = 0
        for (const wave of clickWavesRef.current) {
          const wdx = cell.x - wave.x
          const wdy = cell.y - wave.y
          const wdist = Math.sqrt(wdx * wdx + wdy * wdy)
          const waveR = (time - wave.t) * 0.4
          const waveWidth = 40
          const diff = Math.abs(wdist - waveR)
          if (diff < waveWidth) {
            waveInfluence = Math.max(waveInfluence, (1 - diff / waveWidth) * 0.8)
          }
        }

        const baseAlpha = cell.state === 1 ? 0.18 : 0.04
        cell.targetAlpha = Math.min(1, baseAlpha + mouseInfluence * 0.82 + waveInfluence)
        cell.alpha += (cell.targetAlpha - cell.alpha) * 0.1

        ctx.globalAlpha = cell.alpha
        ctx.fillStyle = "#ffffff"
        ctx.font = `${Math.round(10 + mouseInfluence * 6)}px monospace`
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"
        ctx.fillText(cell.state === 1 ? "1" : "0", cell.x, cell.y)
      }

      ctx.globalAlpha = 1

      // remove old waves
      clickWavesRef.current = clickWavesRef.current.filter(
        (w) => time - w.t < 3000
      )

      animRef.current = requestAnimationFrame(animate)
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }
    const onClick = (e: MouseEvent) => {
      clickWavesRef.current.push({ x: e.clientX, y: e.clientY, t: timeRef.current })
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
