"use client"

import { useEffect, useRef } from "react"

const WORDS = ["CONF","TALK","OPEN","CODE","SHIP","LIVE","DEMO","BUILD","NEXT","DATA"]
function wordAt(col: number, row: number) {
  const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
  return WORDS[h % WORDS.length]
}

const ROW_COLORS = [
  "#0d1f17",
  "#1a4731",
  "#276749",
  "#3ECF8E",
  "#5cd9a0",
  "#a8f0d4",
  "#276749",
  "#1a4731",
]

const STEP = 28
// How many rows above/below the cursor get influenced
const ROW_RADIUS = 6

export default function DitherRowsCursor() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const rafRef = useRef(0)
  const lastRef = useRef(0)
  // Per-row smoothed influence value — persists between frames
  const rowInfluenceRef = useRef<Float32Array>(new Float32Array(0))

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    ctx.imageSmoothingEnabled = false

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      canvas.style.width = W + "px"
      canvas.style.height = H + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.imageSmoothingEnabled = false
      const rows = Math.ceil(H / STEP) + 2
      rowInfluenceRef.current = new Float32Array(rows)
    }

    const frame = (now: number) => {
      rafRef.current = requestAnimationFrame(frame)
      const dt = now - (lastRef.current || now - 16)
      lastRef.current = now
      const delta = Math.min(dt / 16.667, 4)

      const W = window.innerWidth, H = window.innerHeight
      const COLS = Math.ceil(W / STEP) + 1
      const ROWS = Math.ceil(H / STEP) + 1

      const mx = mouseRef.current.x
      const my = mouseRef.current.y
      const cursorRow = my / STEP // fractional row under cursor

      // Update per-row influence with asymmetric lerp — fast up, very slow decay
      const inf = rowInfluenceRef.current
      if (inf.length < ROWS) {
        const next = new Float32Array(ROWS)
        next.set(inf.subarray(0, Math.min(inf.length, ROWS)))
        rowInfluenceRef.current = next
      }

      for (let r = 0; r < ROWS; r++) {
        // Distance in rows from cursor
        const rowDist = Math.abs(r - cursorRow)
        // Influence falls off with row distance — full at 0, zero at ROW_RADIUS
        const target = my < 0 ? 0 : Math.max(0, 1 - rowDist / ROW_RADIUS)
        const lerpUp = 0.14 * delta
        const lerpDown = 0.004 * delta  // ~10x slower decay = long residue
        const speed = target > inf[r] ? lerpUp : lerpDown
        inf[r] = inf[r] + (target - inf[r]) * speed
      }

      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, W, H)

      for (let row = 0; row <= ROWS; row++) {
        const rowInf = inf[row] ?? 0
        // Row-bias: odd rows need slightly more influence to flip — creates the stripe
        const threshold = row % 2 === 0 ? 0.35 : 0.55
        const inside = rowInf > threshold

        for (let col = 0; col <= COLS; col++) {
          const cx = col * STEP
          const cy = row * STEP

          if (inside) {
            const rowColor = ROW_COLORS[row % ROW_COLORS.length]
            ctx.fillStyle = rowColor
            ctx.fillRect(cx - STEP / 2, cy - STEP / 2, STEP, STEP)
            ctx.fillStyle = "#ffffff"
            ctx.font = "bold 8px monospace"
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            ctx.fillText(wordAt(col, row), cx, cy)
          } else {
            // Dim dot, tinted slightly with the row color as a ghost hint
            const rowColor = ROW_COLORS[row % ROW_COLORS.length]
            ctx.fillStyle = rowInf > 0.05 ? rowColor : "#cccccc"
            ctx.beginPath()
            ctx.arc(cx, cy, rowInf > 0.05 ? 2.5 : 1.5, 0, Math.PI * 2)
            ctx.fill()
          }
        }
      }
    }

    resize()
    rafRef.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", e => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    })
    canvas.addEventListener("mouseleave", () => {
      mouseRef.current = { x: -9999, y: -9999 }
    })

    return () => {
      cancelAnimationFrame(rafRef.current)
      window.removeEventListener("resize", resize)
    }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
}
