"use client"

import { useEffect, useRef, useState } from "react"

interface Slot { x:number;level:number;span:number;color:number }
interface Span { x:number;w:number;level:number;color:number }
interface Row { y:number;rowIdx:number;slots:Slot[];spans:Span[] }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// Wordless rows-color pills on a fixed grid. At rest every slot is a small
// uniform dash. Some slot runs are pre-seeded as spans — when the field
// reaches them, a single long pill (2–4 slots wide) manifests above the
// dashes, which fade out beneath it. Light mode uses dither-green-light.
// Distinct shades — rows pick one at random; strands within a row may differ
const ROWS_DARK: [number,number,number][] = [
  [26,71,49],    // #1a4731
  [39,103,73],   // #276749
  [62,207,142],  // #3ECF8E
  [92,217,160],  // #5cd9a0
  [168,240,212], // #a8f0d4
]
// dither-green-light tile colors
const ROWS_LIGHT: [number,number,number][] = [
  [26,71,49],    // #1a4731
  [39,103,73],   // #276749
  [13,158,106],  // #0d9e6a
  [62,207,142],  // #3ECF8E
  [168,240,212], // #a8f0d4
]
const DIM_DARK: [number,number,number] = [16,36,26]
const DIM_LIGHT: [number,number,number] = [184,180,174] // #b8b4ae dots from dither-green-light

const QL = 32
const blend = (rows:[number,number,number][], dim:[number,number,number]) => rows.map(c =>
  Array.from({length: QL+1}, (_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
)
const FILLS_DARK = blend(ROWS_DARK, DIM_DARK)
const FILLS_LIGHT = blend(ROWS_LIGHT, DIM_LIGHT)

export default function PillRowsBlocks() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const rowsR = useRef<Row[]>([])
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)
  const timeR = useRef(0)

  const [mode, setMode] = useState<"tween"|"step">("step")
  const [speed, setSpeed] = useState(1)
  const [rowVar, setRowVar] = useState(0.8)
  const [ease, setEase] = useState(1)
  const [steps, setSteps] = useState(4)
  const ctl = useRef({mode, speed, rowVar, ease, steps})
  ctl.current = {mode, speed, rowVar, ease, steps}

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const UNIT = 24        // grid slot width
    const GAP = 4
    const ROW_SPACING = 15
    const PILL_H = 11

    const resize = ()=>{
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
      const nRows=Math.ceil(H/ROW_SPACING)+1
      const rows:Row[]=[]
      let prevColor=-1
      for(let r=0;r<nRows;r++){
        // Scramble the per-row seed — linear seeds into an LCG produce
        // correlated first draws, which grouped colors across nearby rows
        let seed=(r*2654435761)>>>0
        seed^=seed>>>15; seed=Math.imul(seed,2246822519)>>>0; seed^=seed>>>13
        const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
        const offset=(r%2)*(UNIT/2)-UNIT
        const nSlots=Math.ceil(W/UNIT)+3
        const slots:Slot[]=[]
        const spans:Span[]=[]
        // Each row owns one random color — never the same as the row above,
        // so random assignment can't form same-color bands. Strands within
        // the row always switch to a *different* color for a few slots.
        let rowColor=Math.floor(rand()*(ROWS_DARK.length-1))
        if(rowColor>=prevColor) rowColor++
        prevColor=rowColor
        let strand=rowColor
        let strandLeft=0
        let i=0
        while(i<nSlots){
          if(strandLeft<=0){
            strand = rand()<0.22 ? Math.floor(rand()*ROWS_DARK.length) : rowColor
            strandLeft = 4+Math.floor(rand()*10)
          }
          const x=i*UNIT+offset
          // Some runs of 2–4 slots host a span pill that manifests when active
          if(rand()<0.12 && i+2<=nSlots){
            const n=Math.min(2+Math.floor(rand()*3), nSlots-i)
            spans.push({x, w:n*UNIT-GAP, level:0, color:strand})
            for(let k=0;k<n;k++) slots.push({x:x+k*UNIT, level:0, span:spans.length-1, color:strand})
            i+=n; strandLeft-=n
          }else{
            slots.push({x, level:0, span:-1, color:strand})
            i++; strandLeft--
          }
        }
        rows.push({y:r*ROW_SPACING+ROW_SPACING/2,rowIdx:r,slots,spans})
      }
      rowsR.current=rows
      blobsR.current=[
        {x:W*.30,y:H*.40,vx:.40,vy:.28,angle:0,  angleSpeed: .004,radiusX:W*.55,radiusY:H*.58},
        {x:W*.70,y:H*.55,vx:-.30,vy:.35,angle:1.2,angleSpeed:-.003,radiusX:W*.48,radiusY:H*.52},
        {x:W*.50,y:H*.20,vx:.22,vy:-.42,angle:2.5,angleSpeed: .005,radiusX:W*.44,radiusY:H*.46},
        {x:W*.18,y:H*.72,vx:-.35,vy:-.22,angle:.8,angleSpeed:-.004,radiusX:W*.50,radiusY:H*.54},
      ]
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      const {mode,speed,rowVar,ease,steps}=ctl.current
      const sd=delta*speed
      timeR.current+=dt*speed
      for(const b of blobsR.current){
        b.x+=b.vx*sd;b.y+=b.vy*sd;b.angle+=b.angleSpeed*sd
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*sd;r.life+=0.04*sd}

      const isDark=document.documentElement.classList.contains("dark")
      const FILLS=isDark?FILLS_DARK:FILLS_LIGHT
      ctx.fillStyle=isDark?"#060e0a":"#f5f0eb"; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y
      const dashW=(UNIT-GAP)*0.4, dashH=PILL_H*0.4

      const influenceAt=(sx:number,cy:number,cx:number)=>{
        let inf=0
        for(const b of blobsR.current){
          const dx=sx-b.x,dy=cy-b.y
          const cos=Math.cos(b.angle),sin=Math.sin(b.angle)
          const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos
          inf+=Math.max(0,1-Math.sqrt((lx/b.radiusX)**2+(ly/b.radiusY)**2))**2
        }
        inf=Math.min(1,inf)
        const cd=Math.sqrt((cx-mx)**2+(cy-my)**2)
        inf=Math.min(1,inf+Math.max(0,1-cd/160)**2*0.7)
        for(const r of ripplesR.current){
          const rd=Math.sqrt((cx-r.x)**2+(cy-r.y)**2)
          const df=Math.abs(rd-r.radius)
          if(df<22)inf=Math.min(1,inf+(1-df/22)*(1-r.life)*0.9)
        }
        return inf
      }

      const advance=(level:number,target:number)=>{
        if(mode==="step") return Math.round(target*(steps-1))/(steps-1)
        const e=(target>level?0.25:0.10)*delta*ease
        return level+(target-level)*Math.min(1,e)
      }

      for(const row of rowsR.current){
        // Bounded sway, not endless drift — rows oscillate around the blob
        // mask at their own rate/phase, so they always swing back to it
        const rh=((row.rowIdx*2654435761)>>>0)%1000/1000
        const drift=Math.sin(timeR.current*0.0007*(0.3+0.7*rh)+row.rowIdx*1.7)*(50+90*rh)*rowVar
        const rowBias = row.rowIdx%2===0 ? 0.0 : 0.22
        const cy=row.y

        // Spans first — their level controls how their slots' dashes fade
        for(const span of row.spans){
          const cx=span.x+span.w/2
          const inf=influenceAt(cx+drift,cy,cx)
          const target=Math.max(0,Math.min(1,(inf-(0.30+rowBias))/0.12+0.5))
          span.level=advance(span.level,target)
        }

        for(const slot of row.slots){
          const cx=slot.x+(UNIT-GAP)/2
          if(slot.span>=0){
            // Covered slot: always a small dash, fading as its span manifests
            const lv=row.spans[slot.span].level
            if(lv<0.97){
              if(lv>0.03) ctx.globalAlpha=1-lv
              ctx.fillStyle=FILLS[0][0]
              ctx.beginPath()
              ctx.roundRect(cx-dashW/2,cy-dashH/2,dashW,dashH,dashH/2)
              ctx.fill()
              if(lv>0.03) ctx.globalAlpha=1
            }
          }else{
            // Free slot: behaves like a normal rows-color pill
            const inf=influenceAt(cx+drift,cy,cx)
            const target=Math.max(0,Math.min(1,(inf-(0.30+rowBias))/0.12+0.5))
            slot.level=advance(slot.level,target)
            const s=0.4+0.6*slot.level
            const w=(UNIT-GAP)*s, h=PILL_H*s
            ctx.fillStyle=FILLS[slot.color][Math.round(slot.level*QL)]
            ctx.beginPath()
            ctx.roundRect(cx-w/2,cy-h/2,w,h,h/2)
            ctx.fill()
          }
        }

        // Span pills manifest above their dashes
        for(const span of row.spans){
          if(span.level<=0.03) continue
          const cx=span.x+span.w/2
          const w=span.w*(0.5+0.5*span.level), h=PILL_H*(0.4+0.6*span.level)
          ctx.globalAlpha=Math.min(1,span.level*1.6)
          ctx.fillStyle=FILLS[span.color][Math.round(span.level*QL)]
          ctx.beginPath()
          ctx.roundRect(cx-w/2,cy-h/2,w,h,h/2)
          ctx.fill()
          ctx.globalAlpha=1
        }
      }
    }

    resize(); raf.current=requestAnimationFrame(frame)
    window.addEventListener("resize",resize)
    canvas.addEventListener("mousemove",e=>{mouse.current={x:e.clientX,y:e.clientY}})
    canvas.addEventListener("mouseleave",()=>{mouse.current={x:-9999,y:-9999}})
    canvas.addEventListener("click",e=>{
      for(let i=0;i<2;i++) ripplesR.current.push({x:e.clientX,y:e.clientY,radius:i*28,life:0})
    })
    return ()=>{ cancelAnimationFrame(raf.current); window.removeEventListener("resize",resize) }
  },[])

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />

      <div className="absolute top-6 right-6 z-50 w-60 font-mono text-[10px] tracking-[0.15em] uppercase bg-black/80 border border-white/20 backdrop-blur-sm p-4 flex flex-col gap-4 text-white/70 select-none">
        <div className="text-white/40">Animation</div>

        <div className="flex gap-1">
          {(["tween","step"] as const).map(m=>(
            <button
              key={m}
              onClick={()=>setMode(m)}
              className={[
                "flex-1 px-2 py-1.5 border transition-colors",
                mode===m
                  ? "bg-white text-black border-white"
                  : "border-white/20 text-white/50 hover:text-white hover:border-white/60",
              ].join(" ")}
            >
              {m}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between"><span>Speed</span><span className="text-white">{speed.toFixed(2)}x</span></span>
          <input type="range" min={0} max={3} step={0.05} value={speed}
            onChange={e=>setSpeed(Number(e.target.value))}
            className="w-full accent-[#3ECF8E]" />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex justify-between"><span>Row drift</span><span className="text-white">{rowVar.toFixed(2)}x</span></span>
          <input type="range" min={0} max={2.5} step={0.05} value={rowVar}
            onChange={e=>setRowVar(Number(e.target.value))}
            className="w-full accent-[#3ECF8E]" />
        </label>

        <label className={["flex flex-col gap-1.5 transition-opacity", mode==="step"?"opacity-30 pointer-events-none":""].join(" ")}>
          <span className="flex justify-between"><span>Ease</span><span className="text-white">{ease.toFixed(2)}x</span></span>
          <input type="range" min={0.2} max={3} step={0.05} value={ease}
            onChange={e=>setEase(Number(e.target.value))}
            className="w-full accent-[#3ECF8E]" />
        </label>

        <label className={["flex flex-col gap-1.5 transition-opacity", mode==="tween"?"opacity-30 pointer-events-none":""].join(" ")}>
          <span className="flex justify-between"><span>Steps</span><span className="text-white">{steps}</span></span>
          <input type="range" min={2} max={6} step={1} value={steps}
            onChange={e=>setSteps(Number(e.target.value))}
            className="w-full accent-[#3ECF8E]" />
        </label>
      </div>
    </>
  )
}
