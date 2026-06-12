"use client"

import { useEffect, useRef } from "react"

interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Pill { x:number;w:number;label:string;jit:number }
interface Row { y:number;color:string;pills:Pill[] }

// Stripe-Sessions-style pill wall: staggered rows of outlined feature pills.
// Animated like rows-color-light — blob fields fill pills as they drift over.
// Every few seconds a wipe front sweeps the wall away and wipes in a new
// content set (features ↔ speaker names).
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
const NAMES = [
  "ANA SOFIA REYES","JAMES OKAFOR","PRIYA SHARMA","LUCAS MEYER","YUKI TANAKA",
  "FATIMA AL-RASHID","DIEGO FERNANDEZ","EMMA LARSSON","CHEN WEI","OLIVIA BENNETT",
  "RAJ PATEL","SOPHIE DUBOIS","MATEO ROSSI","AISHA MOHAMMED","NOAH KIM",
  "ISABELLA SILVA","MAX HOFFMANN","ZARA AHMED","LEO VIRTANEN","MAYA KRISHNAN",
  "TOM VAN DER BERG","NINA PETROVA","KAI NAKAMURA","GRACE O'CONNOR",
  "SAMUEL ADEBAYO","ELENA VOLKOV","ARTHUR MOREAU","LILY ZHANG","OSCAR LINDQVIST",
  "AMARA OKONKWO","FELIX WAGNER","INES GARCIA","HUGO MARTINS","SARA HAUGEN",
  "DANIEL COHEN","ALICE THOMPSON","VIKTOR JOHANSSON","RUBY WILLIAMS",
  "ANDRES CASTRO","HANNA VIRTA","JOAO PEREIRA","MIRA SOLBERG",
]
const SETS = [FEATURES, NAMES]

// Green ramp by row, dark at top to bright at bottom (kept readable on white)
const ROW_STOPS: [number,number,number][] = [
  [13,63,38],    // deep forest
  [26,107,63],   // forest
  [42,143,86],   // emerald
  [62,207,142],  // supabase green
  [92,217,160],  // light green
]
function rowColor(t:number){
  t=Math.max(0,Math.min(1,t))
  const f=t*(ROW_STOPS.length-1)
  const i=Math.min(ROW_STOPS.length-2,Math.floor(f)), u=f-i
  const a=ROW_STOPS[i], b=ROW_STOPS[i+1]
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*u)},${Math.round(a[1]+(b[1]-a[1])*u)},${Math.round(a[2]+(b[2]-a[2])*u)})`
}

export default function PillFeatures() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const rowsR = useRef<Row[]>([])
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const ROW_GAP = 34
    const PILL_H = 24
    const PAD_X = 9
    const GAP = 6
    const FONT = "bold 10px monospace"

    // Wipe state machine: idle → out (sweep away) → in (sweep new set on)
    const HOLD = 6500, WIPE_MS = 1100, FEATHER = 220
    let mode: "idle"|"out"|"in" = "idle"
    let modeStart = 0
    let setIdx = 0

    const buildRows = (set:string[])=>{
      const W = window.innerWidth, H = window.innerHeight
      ctx.font=FONT
      const nRows=Math.ceil(H/ROW_GAP)+1
      const rows:Row[]=[]
      for(let r=0;r<nRows;r++){
        let seed=((r+setIdx*131)*2654435761)>>>0
        const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
        let x=-rand()*120
        let fi=Math.floor(rand()*set.length)
        const pills:Pill[]=[]
        while(x<W+40){
          fi=(fi+1+Math.floor(rand()*(set.length-2)))%set.length
          const label=set[fi]
          const w=ctx.measureText(label).width+PAD_X*2
          pills.push({x,w,label,jit:(rand()-0.5)*140})
          x+=w+GAP
        }
        rows.push({y:r*ROW_GAP+ROW_GAP/2,color:rowColor(r/(nRows-1)),pills})
      }
      rowsR.current=rows
    }

    const resize = ()=>{
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
      blobsR.current=[
        {x:W*.30,y:H*.40,vx:.40,vy:.28,angle:0,  angleSpeed: .004,radiusX:W*.55,radiusY:H*.58},
        {x:W*.70,y:H*.55,vx:-.30,vy:.35,angle:1.2,angleSpeed:-.003,radiusX:W*.48,radiusY:H*.52},
        {x:W*.50,y:H*.20,vx:.22,vy:-.42,angle:2.5,angleSpeed: .005,radiusX:W*.44,radiusY:H*.46},
        {x:W*.18,y:H*.72,vx:-.35,vy:-.22,angle:.8,angleSpeed:-.004,radiusX:W*.50,radiusY:H*.54},
      ]
      buildRows(SETS[setIdx])
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      if(!modeStart) modeStart=now
      if(mode==="idle" && now-modeStart>HOLD){ mode="out"; modeStart=now }
      else if(mode==="out" && now-modeStart>WIPE_MS+400){
        setIdx=(setIdx+1)%SETS.length
        buildRows(SETS[setIdx])
        mode="in"; modeStart=now
      }
      else if(mode==="in" && now-modeStart>WIPE_MS+400){ mode="idle"; modeStart=now }

      // Wipe front travels left → right, FEATHER soft edge, pills jitter-stagger
      const frontX = mode==="idle" ? Infinity
        : -FEATHER + ((now-modeStart)/WIPE_MS)*(W+2*FEATHER+140)

      for(const b of blobsR.current){
        b.x+=b.vx*delta;b.y+=b.vy*delta;b.angle+=b.angleSpeed*delta
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*delta;r.life+=0.04*delta}

      ctx.fillStyle="#ffffff"; ctx.fillRect(0,0,W,H)
      ctx.font=FONT
      ctx.textAlign="center"; ctx.textBaseline="middle"

      const mx=mouse.current.x,my=mouse.current.y

      for(let ri=0;ri<rowsR.current.length;ri++){
        const row=rowsR.current[ri]
        for(const pill of row.pills){
          const cx=pill.x+pill.w/2, cy=row.y

          // Wipe progress at this pill: 0 untouched → 1 fully past
          let s=1
          if(mode!=="idle"){
            let p=(frontX-(cx+pill.jit))/FEATHER+0.5
            if(p<0)p=0; else if(p>1)p=1
            s = mode==="out" ? 1-p : p
            if(s<=0.02) continue
          }

          let inf=0
          for(const b of blobsR.current){
            const dx=cx-b.x,dy=cy-b.y
            const cos=Math.cos(b.angle),sin=Math.sin(b.angle)
            const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos
            inf+=Math.max(0,1-Math.sqrt((lx/b.radiusX)**2+(ly/b.radiusY)**2))**2
          }
          inf=Math.min(1,inf)
          const cd=Math.sqrt((cx-mx)**2+(cy-my)**2)
          inf=Math.min(1,inf+Math.max(0,1-cd/200)**2*0.7)
          for(const r of ripplesR.current){
            const rd=Math.sqrt((cx-r.x)**2+(cy-r.y)**2)
            const df=Math.abs(rd-r.radius)
            if(df<40)inf=Math.min(1,inf+(1-df/40)*(1-r.life)*0.9)
          }

          const rowBias = ri%2===0 ? 0.0 : 0.12
          const filled = inf > 0.30 + rowBias

          if(s<1){
            ctx.save()
            ctx.translate(cx,cy); ctx.scale(s,s); ctx.translate(-cx,-cy)
            ctx.globalAlpha=s
          }
          ctx.beginPath()
          ctx.roundRect(pill.x,row.y-PILL_H/2,pill.w,PILL_H,PILL_H/2)
          if(filled){
            ctx.fillStyle=row.color
            ctx.fill()
            ctx.fillStyle="#ffffff"
          }else{
            ctx.strokeStyle=row.color
            ctx.lineWidth=1.5
            ctx.stroke()
            ctx.fillStyle=row.color
          }
          ctx.fillText(pill.label,cx,cy)
          if(s<1){
            ctx.restore()
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

  return <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
}
