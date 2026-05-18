"use client"

import { useEffect, useRef } from "react"

interface Blob {
  x: number; y: number
  vx: number; vy: number
  angle: number; angleSpeed: number
  // 8 radial spokes with individual wobble phases — creates organic irregular shape
  spokes: number[]      // base radius per spoke (0–7, evenly spaced angles)
  spokePhases: number[] // wobble phase offsets
  spokeSpeed: number    // how fast spokes wobble
}
interface Ripple { x:number; y:number; radius:number; life:number }

const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]
const WORDS = ["CONF","TALK","OPEN","CODE","SHIP","LIVE","DEMO","BUILD","NEXT","DATA"]
function wordAt(col:number,row:number){ const h=((col*2654435761)^(row*2246822519))>>>0; return WORDS[h%WORDS.length] }

const TILE_COLORS = ["#0d9e6a","#1a4731","#276749","#3ECF8E","#a8f0d4"]
function tileColor(inf: number): string {
  if (inf > 0.75) return TILE_COLORS[1]
  if (inf > 0.55) return TILE_COLORS[2]
  if (inf > 0.40) return TILE_COLORS[3]
  if (inf > 0.28) return TILE_COLORS[4]
  return TILE_COLORS[4]
}

const DOT_COLORS = ["#b8b4ae","#b8d4c8","#8ec8b0","#5db896","#3ECF8E"]
function dotColor(inf: number): string {
  if (inf > 0.25) return DOT_COLORS[4]
  if (inf > 0.16) return DOT_COLORS[3]
  if (inf > 0.10) return DOT_COLORS[2]
  if (inf > 0.05) return DOT_COLORS[1]
  return DOT_COLORS[0]
}

// Compute influence of an organic blob at point (px, py)
// Uses 8 radial spokes, wobbled by sin — making an amoeba-like boundary
function blobInfluence(blob: Blob, px: number, py: number, t: number): number {
  const dx = px - blob.x
  const dy = py - blob.y
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist === 0) return 1

  // Normalise angle to [0, 2π]
  const normAngle = ((Math.atan2(dy, dx) - blob.angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2)

  // Interpolate between the 8 spokes to get effective radius at this angle
  const N = blob.spokes.length
  const rawIdx = (normAngle / (Math.PI * 2)) * N
  const i0 = Math.floor(rawIdx) % N
  const i1 = (i0 + 1) % N
  const frac = rawIdx - Math.floor(rawIdx)

  const r0 = Math.max(20, blob.spokes[i0] * (1 + 0.22 * Math.sin(t * blob.spokeSpeed + blob.spokePhases[i0])))
  const r1 = Math.max(20, blob.spokes[i1] * (1 + 0.22 * Math.sin(t * blob.spokeSpeed + blob.spokePhases[i1])))
  const effectiveRadius = r0 + frac * (r1 - r0)

  const norm = dist / effectiveRadius
  return Math.max(0, 1 - norm)
}

export default function DitherGreenOrganic() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({ x: -9999, y: -9999 })
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)
  const t = useRef(0)
  const cursorMap = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const STEP = 28

    const makeBlob = (W: number, H: number, x: number, y: number, vx: number, vy: number, baseR: number): Blob => ({
      x, y, vx, vy,
      angle: Math.random() * Math.PI * 2,
      angleSpeed: (Math.random() - 0.5) * 0.004,
      // 8 spokes — each slightly different length, biased to be wider horizontally
      spokes: Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        // Elongate horizontally — spokes near 0/pi are longer
        const hBias = 1 + 0.5 * Math.abs(Math.cos(a))
        return baseR * hBias * (0.75 + Math.random() * 0.5)
      }),
      spokePhases: Array.from({ length: 8 }, () => Math.random() * Math.PI * 2),
      spokeSpeed: 0.4 + Math.random() * 0.4,
    })

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
      canvas.style.width = W + "px"; canvas.style.height = H + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      blobsR.current = [
        makeBlob(W, H, W * 0.30, H * 0.35, 0.36,  0.20, Math.min(W, H) * 0.30),
        makeBlob(W, H, W * 0.65, H * 0.55,-0.24,  0.32, Math.min(W, H) * 0.26),
        makeBlob(W, H, W * 0.50, H * 0.20, 0.18, -0.38, Math.min(W, H) * 0.22),
        makeBlob(W, H, W * 0.20, H * 0.70,-0.30,  0.18, Math.min(W, H) * 0.24),
        makeBlob(W, H, W * 0.75, H * 0.25, 0.28,  0.28, Math.min(W, H) * 0.20),
      ]
    }

    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame)
      const dt = now - (last.current || now - 16); last.current = now
      const delta = Math.min(dt / 16.667, 4)
      t.current = (t.current + 0.016 * delta) % (Math.PI * 200)
      const W = window.innerWidth, H = window.innerHeight

      for (const b of blobsR.current) {
        b.x += b.vx * delta; b.y += b.vy * delta
        b.angle += b.angleSpeed * delta
        if (b.x < 0 || b.x > W) b.vx *= -1
        if (b.y < 0 || b.y > H) b.vy *= -1
      }
      ripplesR.current = ripplesR.current.filter(r => r.life < 1)
      for (const r of ripplesR.current) { r.radius += 10 * delta; r.life += 0.04 * delta }

      ctx.fillStyle = "#f5f0eb"; ctx.fillRect(0, 0, W, H)

      const mx = mouse.current.x, my = mouse.current.y
      const COLS = Math.ceil(W / STEP) + 1, ROWS = Math.ceil(H / STEP) + 1

      for (let row = 0; row <= ROWS; row++) {
        for (let col = 0; col <= COLS; col++) {
          const cx = col * STEP, cy = row * STEP
          let inf = 0

          for (const b of blobsR.current) {
            inf += blobInfluence(b, cx, cy, t.current)
          }
          inf = Math.min(1, inf)

          // Cursor — lerped per cell, fast build slow decay
          const cdx = (cx - mx) / 2.8
          const cdy = cy - my
          const cursorTarget = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / 160) ** 2 * 0.7
          const key = `${col},${row}`
          const prev = cursorMap.current.get(key) ?? 0
          const lerpSpeed = cursorTarget > prev ? 0.10 * delta : 0.006 * delta
          const smoothCursor = prev + (cursorTarget - prev) * lerpSpeed
          cursorMap.current.set(key, smoothCursor)
          inf = Math.min(1, inf + smoothCursor)

          for (const r of ripplesR.current) {
            const rd = Math.sqrt((cx - r.x) ** 2 + (cy - r.y) ** 2)
            const df = Math.abs(rd - r.radius)
            if (df < 22) inf = Math.min(1, inf + (1 - df / 22) * (1 - r.life) * 0.9)
          }

          const bayer = BAYER[row % 4][col % 4] / 16
          const inside = inf > 0.28 + (bayer - 0.5) * 0.22

          if (inside) {
            ctx.fillStyle = tileColor(inf)
            ctx.fillRect(cx - STEP / 2, cy - STEP / 2, STEP, STEP)
            ctx.fillStyle = "#0a1a10"
            ctx.font = "bold 8px monospace"
            ctx.textAlign = "center"; ctx.textBaseline = "middle"
            ctx.fillText(wordAt(col, row), cx, cy)
          } else {
            const dotR = 1 + inf * 3
            ctx.fillStyle = dotColor(inf)
            ctx.beginPath(); ctx.arc(cx, cy, dotR, 0, Math.PI * 2); ctx.fill()
          }
        }
      }
    }

    resize(); raf.current = requestAnimationFrame(frame)
    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", e => { mouse.current = { x: e.clientX, y: e.clientY } })
    canvas.addEventListener("mouseleave", () => { mouse.current = { x: -9999, y: -9999 } })
    canvas.addEventListener("click", e => {
      for (let i = 0; i < 2; i++) ripplesR.current.push({ x: e.clientX, y: e.clientY, radius: i * 28, life: 0 })
    })
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("resize", resize) }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
}
