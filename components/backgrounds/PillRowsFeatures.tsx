"use client"

import { useEffect, useRef, useState } from "react"

interface Pill { x:number;w:number;label:string;level:number }
interface Row { y:number;rowIdx:number;pills:Pill[] }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// Rows-color pill animation with real feature labels: variable-width pills
// of Supabase/Postgres features, row-cycled greens, independent row drift,
// tween/step controls, and light/dark support.
const FEATURES = [
  "ROW LEVEL SECURITY","REALTIME","EDGE FUNCTIONS","PGVECTOR","AUTH","STORAGE",
  "POSTGRES","BRANCHING","READ REPLICAS","FOREIGN DATA WRAPPERS","CRON JOBS",
  "WEBHOOKS","FULL TEXT SEARCH","POSTGIS","SUPAVISOR","CONNECTION POOLING",
  "DATABASE FUNCTIONS","TRIGGERS","JSONB","LOGICAL REPLICATION",
  "POINT IN TIME RECOVERY","PG_GRAPHQL","STUDIO","CLI","TYPE GENERATION",
  "MIGRATIONS","LOG DRAINS","STORAGE CDN","IMAGE TRANSFORMATIONS","OAUTH",
  "MFA","RATE LIMITING","PG_STAT_STATEMENTS","PARTITIONING",
  "MATERIALIZED VIEWS","EXTENSIONS","PG_CRON","VAULT","DECLARATIVE SCHEMAS",
  "DATA APIS","AI ASSISTANT","PGBOUNCER","WAL ARCHIVING","UPSERTS",
]

const ROW_COLORS: [number,number,number][] = [
  [13,31,23],
  [26,71,49],
  [39,103,73],
  [62,207,142],
  [92,217,160],
  [168,240,212],
  [39,103,73],
  [26,71,49],
]
const DIM_DARK: [number,number,number] = [16,36,26]
const DIM_LIGHT: [number,number,number] = [226,218,211] // warm dash on #F6F0EC

const QL = 32
const blend = (dim:[number,number,number]) => ROW_COLORS.map(c =>
  Array.from({length: QL+1}, (_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
)
const FILLS_DARK = blend(DIM_DARK)
const FILLS_LIGHT = blend(DIM_LIGHT)

export default function PillRowsFeatures() {
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
    const ROW_SPACING = 19
    const PILL_H = 15
    const PAD_X = 8
    const GAP = 4
    const FONT = "bold 9px monospace"

    const resize = ()=>{
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
      ctx.font=FONT
      const nRows=Math.ceil(H/ROW_SPACING)+1
      const rows:Row[]=[]
      for(let r=0;r<nRows;r++){
        let seed=(r*2654435761)>>>0
        const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
        let x=-rand()*120
        let fi=Math.floor(rand()*FEATURES.length)
        const pills:Pill[]=[]
        while(x<W+40){
          fi=(fi+1+Math.floor(rand()*(FEATURES.length-2)))%FEATURES.length
          const label=FEATURES[fi]
          const w=ctx.measureText(label).width+PAD_X*2
          pills.push({x,w,label,level:0})
          x+=w+GAP
        }
        rows.push({y:r*ROW_SPACING+ROW_SPACING/2,rowIdx:r,pills})
      }
      rowsR.current=rows
      blobsR.current=[
        {x:W*.30,y:H*.40,vx:.40,vy:.28,angle:0,  angleSpeed: .004,radiusX:W*.55,radiusY:H*.58},
        {x:W*.70,y:H*.55,vx:-.30,vy:.35,angle:1.2,angleSpeed:-.003,radiusX:W*.48,radiusY:H*.52},
        {x:W*.50,y:H*.20,vx:.22,vy:-.42,angle:2.5,angleSpeed: .005,radiusX:W*.44,radiusY:H*.46},
        {x:W*.18,y:H*.72,vx:-.35,vy:-.22,angle:.8,angleSpeed:-.004,radiusX:W*.50,radiusY:H*.54},
      ]
    }

    // White label sprites, one per feature — stamped with drawImage
    const sprites = new Map<string, HTMLCanvasElement>()
    const sprite = (label:string)=>{
      let c=sprites.get(label)
      if(!c){
        const dpr=window.devicePixelRatio||1
        const fs=9
        const tmp=document.createElement("canvas")
        const m=tmp.getContext("2d")!
        m.font=FONT
        const w=Math.ceil(m.measureText(label).width)+2, h=fs+3
        c=tmp
        c.width=w*dpr; c.height=h*dpr
        const tc=c.getContext("2d")!
        tc.scale(dpr,dpr)
        tc.font=FONT
        tc.textAlign="center"; tc.textBaseline="middle"
        tc.fillStyle="#ffffff"
        tc.fillText(label,w/2,h/2)
        sprites.set(label,c)
      }
      return c
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
      ctx.fillStyle=isDark?"#060e0a":"#F6F0EC"; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y
      const dpr=window.devicePixelRatio||1

      for(const row of rowsR.current){
        // Bounded sway, not endless drift — rows oscillate around the blob
        // mask at their own rate/phase, so they always swing back to it
        const rh=((row.rowIdx*2654435761)>>>0)%1000/1000
        const drift=Math.sin(timeR.current*0.0007*(0.3+0.7*rh)+row.rowIdx*1.7)*(50+90*rh)*rowVar
        const rowBias = row.rowIdx%2===0 ? 0.0 : 0.22
        const fills=FILLS[row.rowIdx%ROW_COLORS.length]

        for(const pill of row.pills){
          const cx=pill.x+pill.w/2, cy=row.y
          const sx=cx+drift
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

          const target = Math.max(0,Math.min(1,(inf-(0.30+rowBias))/0.12+0.5))
          if(mode==="step"){
            pill.level = Math.round(target*(steps-1))/(steps-1)
          }else{
            const e = (target>pill.level ? 0.25 : 0.10)*delta*ease
            pill.level += (target-pill.level)*Math.min(1,e)
          }

          const s=0.4+0.6*pill.level
          const w=pill.w*s, h=PILL_H*s
          const q=Math.round(pill.level*QL)
          ctx.fillStyle=fills[q]
          ctx.beginPath()
          ctx.roundRect(cx-w/2,cy-h/2,w,h,h/2)
          ctx.fill()

          const textAlpha=(pill.level-0.55)/0.25
          if(textAlpha>0){
            const spr=sprite(pill.label)
            const dw=(spr.width/dpr)*s, dh=(spr.height/dpr)*s
            ctx.globalAlpha=Math.min(1,textAlpha)
            ctx.drawImage(spr,cx-dw/2,cy-dh/2,dw,dh)
            ctx.globalAlpha=1
          }
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
