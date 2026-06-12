"use client"

import { useEffect, useRef } from "react"

interface Cell {
  x: number
  y: number
  word: string
  smoothCursor: number
  level: number
}

interface Ripple {
  x: number
  y: number
  radius: number
  speed: number
  width: number
  life: number
}

interface Blob {
  x: number
  y: number
  vx: number
  vy: number
  angle: number
  angleSpeed: number
  radiusX: number
  radiusY: number
}

// Conference words cycling through the grid
const WORDS = ["CONF", "TALK", "BUILD", "SHIP", "DEMO", "OPEN", "LIVE", "CODE", "MAKE", "NEXT", "EDGE", "DATA"]

// 5 color stops — Supabase greens, dark to bright, tweened continuously
// Each stop: [bg rgb, text rgb]
const STOPS: [[number,number,number],[number,number,number]][] = [
  [[13,31,23],   [26,58,42]],    // almost invisible dark green
  [[26,71,49],   [62,207,142]],  // dark green bg, brand green text
  [[39,103,73],  [237,255,247]], // mid green bg, mint text
  [[62,207,142], [13,31,23]],    // brand green bg, dark text
  [[237,255,247],[13,31,23]],    // near-white mint bg, dark text
]

// Map raw influence to ramp position, matching the old tier thresholds
// (0.05→1, 0.15→2, 0.35→3, 0.65→4) but as a smooth piecewise curve
const CURVE: [number,number][] = [[0,0],[0.05,0.25],[0.15,0.5],[0.35,0.75],[0.65,1],[1,1]]
function rampPos(v: number): number {
  for (let i = 1; i < CURVE.length; i++) {
    if (v <= CURVE[i][0]) {
      const [x0,y0] = CURVE[i-1], [x1,y1] = CURVE[i]
      return y0 + (y1-y0) * ((v-x0) / (x1-x0))
    }
  }
  return 1
}

function colorsAt(t: number): [string, string] {
  t = Math.max(0, Math.min(1, t))
  const f = t * (STOPS.length - 1)
  const i = Math.min(STOPS.length - 2, Math.floor(f)), u = f - i
  const [bg0, fg0] = STOPS[i], [bg1, fg1] = STOPS[i+1]
  const bg = `rgb(${Math.round(bg0[0]+(bg1[0]-bg0[0])*u)},${Math.round(bg0[1]+(bg1[1]-bg0[1])*u)},${Math.round(bg0[2]+(bg1[2]-bg0[2])*u)})`
  const fg = `rgb(${Math.round(fg0[0]+(fg1[0]-fg0[0])*u)},${Math.round(fg0[1]+(fg1[1]-fg0[1])*u)},${Math.round(fg0[2]+(fg1[2]-fg0[2])*u)})`
  return [bg, fg]
}

// Colors quantized to 48 levels — imperceptible steps, but lets us cache
// fill styles and pre-rendered text sprites instead of per-pill fillText
const QL = 48
const BG_COLORS: string[] = []
const FG_COLORS: string[] = []
for (let q = 0; q < QL; q++) {
  const [bg, fg] = colorsAt(q / (QL - 1))
  BG_COLORS.push(bg)
  FG_COLORS.push(fg)
}

export default function PillGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouseRef = useRef({ x: -9999, y: -9999 })
  const cellsRef = useRef<Cell[]>([])
  const animRef = useRef<number>(0)
  const ripplesRef = useRef<Ripple[]>([])
  const blobsRef = useRef<Blob[]>([])
  const lastTimeRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Pill grid spacing — wider than shapes because pills are wider
    const COL_SPACING = 38
    const ROW_SPACING = 19

    const wordForCell = (col: number, row: number): string => {
      const h = ((col * 2654435761) ^ (row * 2246822519)) >>> 0
      return WORDS[h % WORDS.length]
    }

    const initCells = () => {
      cellsRef.current = []
      const W = window.innerWidth
      const H = window.innerHeight
      const cols = Math.ceil(W / COL_SPACING) + 2
      const rows = Math.ceil(H / ROW_SPACING) + 2
      // Offset every other row for a staggered brick layout
      for (let r = 0; r <= rows; r++) {
        const offset = (r % 2) * (COL_SPACING / 2)
        for (let c = 0; c <= cols; c++) {
          cellsRef.current.push({
            x: Math.round(c * COL_SPACING + offset),
            y: Math.round(r * ROW_SPACING),
            word: wordForCell(c, r),
            smoothCursor: 0,
            level: 0,
          })
        }
      }
    }

    const initBlobs = () => {
      const W = window.innerWidth
      const H = window.innerHeight
      blobsRef.current = [
        { x: W * 0.35, y: H * 0.40, vx:  0.44, vy:  0.28, angle: 0,   angleSpeed:  0.0044, radiusX: W * 0.52, radiusY: H * 0.58 },
        { x: W * 0.65, y: H * 0.60, vx: -0.32, vy:  0.4, angle: 1.2, angleSpeed: -0.0036, radiusX: W * 0.48, radiusY: H * 0.54 },
        { x: W * 0.50, y: H * 0.25, vx:  0.24, vy: -0.48, angle: 2.5, angleSpeed:  0.0052, radiusX: W * 0.42, radiusY: H * 0.46 },
        { x: W * 0.20, y: H * 0.70, vx: -0.4, vy: -0.24, angle: 0.8, angleSpeed: -0.004, radiusX: W * 0.50, radiusY: H * 0.52 },
      ]
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      const w = window.innerWidth
      const h = window.innerHeight
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = w + "px"
      canvas.style.height = h + "px"
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      initCells()
      initBlobs()
    }

    // Text sprites: each (word, color level) rendered once, then drawImage'd.
    // fillText per pill per frame was the bottleneck at ~4.5k pills.
    const textSprites = new Map<string, HTMLCanvasElement>()
    const textSprite = (word: string, q: number) => {
      const key = word + "|" + q
      let c = textSprites.get(key)
      if (!c) {
        const dpr = window.devicePixelRatio || 1
        const fs = 9
        const w = Math.ceil(word.length * fs * 0.62) + 2
        const h = fs + 2
        c = document.createElement("canvas")
        c.width = w * dpr
        c.height = h * dpr
        const tc = c.getContext("2d")!
        tc.scale(dpr, dpr)
        tc.font = `${fs}px monospace`
        tc.textAlign = "center"
        tc.textBaseline = "middle"
        tc.fillStyle = FG_COLORS[q]
        tc.fillText(word, w / 2, h / 2)
        textSprites.set(key, c)
      }
      return c
    }

    // Draw a pill: rounded rectangle with text inside, size is a 0–1 scale factor
    const drawPill = (x: number, y: number, word: string, scale: number, t: number) => {
      const s = Math.max(0.15, scale)
      const q = Math.min(QL - 1, Math.max(0, Math.round(t * (QL - 1))))

      // Pill dimensions driven by scale — small pills are narrow dashes.
      // At full scale: width 34, height 15 → 4px gap on both axes
      // (COL 38, ROW 19), so active x and y margins match.
      const fontSize = Math.max(4, s * 9)
      const paddingY = s * 3
      const pillW = (COL_SPACING - 4) * s
      const pillH = fontSize + paddingY * 2

      ctx.fillStyle = BG_COLORS[q]
      ctx.beginPath()
      ctx.roundRect(x - pillW / 2, y - pillH / 2, pillW, pillH, pillH / 2)
      ctx.fill()

      // Text — fades in as the pill grows instead of popping at a threshold
      const textAlpha = Math.max(0, Math.min(1, (s - 0.3) / 0.15))
      if (textAlpha > 0) {
        const spr = textSprite(word, q)
        const dpr = window.devicePixelRatio || 1
        const dw = (spr.width / dpr) * s
        const dh = (spr.height / dpr) * s
        if (textAlpha < 1) ctx.globalAlpha = textAlpha
        ctx.drawImage(spr, x - dw / 2, y - dh / 2, dw, dh)
        if (textAlpha < 1) ctx.globalAlpha = 1
      }
    }

    const MAX_SCALE = 1.0
    const MIN_SCALE = 0.5
    const CURSOR_RADIUS = 150
    const CURSOR_BOOST = 0.5
    const RIPPLE_BOOST = 0.6

    const animate = (now: number) => {
      animRef.current = requestAnimationFrame(animate)
      const delta = Math.min((now - (lastTimeRef.current || now)) / 16.667, 4)
      lastTimeRef.current = now


      const W = window.innerWidth
      const H = window.innerHeight

      for (const blob of blobsRef.current) {
        blob.x += blob.vx * delta
        blob.y += blob.vy * delta
        blob.angle += blob.angleSpeed * delta
        if (blob.x < 0 || blob.x > W) blob.vx *= -1
        if (blob.y < 0 || blob.y > H) blob.vy *= -1
      }

      ctx.fillStyle = "#060e0a"
      ctx.fillRect(0, 0, W, H)

      const mx = mouseRef.current.x
      const my = mouseRef.current.y

      for (const cell of cellsRef.current) {
        let totalInfluence = 0
        for (const blob of blobsRef.current) {
          const dx = cell.x - blob.x
          const dy = cell.y - blob.y
          const cos = Math.cos(blob.angle)
          const sin = Math.sin(blob.angle)
          const lx = dx * cos + dy * sin
          const ly = -dx * sin + dy * cos
          const ellipseDist = Math.sqrt((lx / blob.radiusX) ** 2 + (ly / blob.radiusY) ** 2)
          const influence = Math.max(0, 1 - ellipseDist)
          totalInfluence += influence * influence
        }
        const clamped = Math.min(1, totalInfluence)

        const cdx = cell.x - mx
        const cdy = cell.y - my
        const cursorTarget = Math.max(0, 1 - Math.sqrt(cdx * cdx + cdy * cdy) / CURSOR_RADIUS)
        const lerpSpeed = cursorTarget > cell.smoothCursor ? 0.08 * delta : 0.008 * delta
        cell.smoothCursor += (cursorTarget - cell.smoothCursor) * lerpSpeed
        const cursorFactor = cell.smoothCursor

        // Ripple
        let rippleBoost = 0
        let rippleWave = 0
        for (const ripple of ripplesRef.current) {
          const cellDist = Math.sqrt((cell.x - ripple.x) ** 2 + (cell.y - ripple.y) ** 2)
          const distFromFront = Math.abs(cellDist - ripple.radius)
          if (distFromFront < ripple.width) {
            const wave = (1 - distFromFront / ripple.width) * (1 - ripple.life)
            rippleBoost = Math.max(rippleBoost, wave * RIPPLE_BOOST)
            rippleWave = Math.max(rippleWave, wave)
          }
        }

        const scale = MIN_SCALE + clamped * (MAX_SCALE - MIN_SCALE) + cursorFactor * CURSOR_BOOST + rippleBoost

        // Tween the color level: ease toward the target instead of snapping
        // between tiers — fast attack, slow release
        const target = Math.max(
          rampPos(Math.min(1, clamped + cursorFactor * 0.6)),
          rippleWave,
        )
        const ease = target > cell.level ? 0.18 * delta : 0.06 * delta
        cell.level += (target - cell.level) * Math.min(1, ease)

        drawPill(cell.x, cell.y, cell.word, scale, cell.level)
      }

      ripplesRef.current = ripplesRef.current.filter((r) => r.life < 1)
      for (const ripple of ripplesRef.current) {
        ripple.radius += ripple.speed * delta
        ripple.life += 0.055 * delta
      }
    }

    const onMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    const onMouseLeave = () => {
      mouseRef.current = { x: -9999, y: -9999 }
    }
    const onClick = (e: MouseEvent) => {
      for (let i = 0; i < 2; i++) {
        ripplesRef.current.push({
          x: e.clientX,
          y: e.clientY,
          radius: i * 20,
          speed: 2.8,
          width: 14,
          life: 0,
        })
      }
    }

    resize()
    animRef.current = requestAnimationFrame(animate)

    window.addEventListener("resize", resize)
    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mouseleave", onMouseLeave)
    canvas.addEventListener("click", onClick)

    return () => {
      window.removeEventListener("resize", resize)
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mouseleave", onMouseLeave)
      canvas.removeEventListener("click", onClick)
      cancelAnimationFrame(animRef.current)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-crosshair"
    />
  )
}
