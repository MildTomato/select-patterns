"use client"

import { useEffect, useRef, useState } from "react"
import { usePattern, PatternPanel, hexToRgb, usePersisted } from "@/components/PatternControls"

interface Slot { x:number;level:number;color:number;jit:number }
interface Seg { L:number;R:number;tL:number;tR:number;birth:number;dying:boolean;matched?:boolean }
interface Row { y:number;rowIdx:number;slots:Slot[];segs:Seg[] }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// Geometric intercept: big primitives — triangle, circle, square,
// hexagon — cut into the row field. Shape edges come from signed-distance
// functions, so the geometry stays crisp while drifting and rotating.
const N_COLORS = 4
const QL = 32
// Density ramp, sparse → dense; per-cell jitter keeps the texture organic
const GLYPHS = [".","·",":",";","-","~","=","+","*","x","#","%","@"]

// Intercepting geometric primitives — rendered in the same grid as the rows.
// Every parameter is rolled per shape (size, velocity, spin rate/direction,
// character, color, pulse), and shapes that leave the canvas respawn from a
// random edge with a fresh roll — the cast keeps changing.
type Kind = "circle"|"square"|"tri"|"hex"
interface Shape {
  kind:Kind;ch:string;color:number
  x:number;y:number;vx:number;vy:number
  angle:number;va:number;R:number
  pulseA:number;pulseF:number;ph:number;curve:number
}

const KINDS:Kind[]=["circle","square","tri","hex"]
const KIND_CHARS:Record<Kind,string[]>={
  circle:["o","*","0"], square:["#","%"], tri:["/","^"], hex:["+","x"],
}

function rollShape(W:number,H:number,fromEdge:boolean,pool:Kind[],color:number):Shape{
  const kind=pool[Math.floor(Math.random()*pool.length)]
  const chs=KIND_CHARS[kind]
  const R=H*(0.08+Math.random()*0.27)
  const sp=0.03+Math.random()*0.15
  let x:number,y:number,dir:number
  if(fromEdge){
    const e=Math.floor(Math.random()*4)
    const t=Math.random()
    if(e===0){ x=-R*1.4; y=t*H; dir=(Math.random()-0.5)*1.6 }                 // left, heading right
    else if(e===1){ x=W+R*1.4; y=t*H; dir=Math.PI+(Math.random()-0.5)*1.6 }   // right, heading left
    else if(e===2){ x=t*W; y=-R*1.4; dir=Math.PI/2+(Math.random()-0.5)*1.6 }  // top, heading down
    else { x=t*W; y=H+R*1.4; dir=-Math.PI/2+(Math.random()-0.5)*1.6 }         // bottom, heading up
  }else{
    x=Math.random()*W; y=Math.random()*H; dir=Math.random()*Math.PI*2
  }
  return {
    kind, ch:chs[Math.floor(Math.random()*chs.length)],
    color,
    x, y, vx:Math.cos(dir)*sp, vy:Math.sin(dir)*sp,
    angle:Math.random()*Math.PI*2,
    va:(0.00008+Math.random()*0.00045)*(Math.random()<0.5?-1:1),
    R,
    pulseA:0.04+Math.random()*0.12,
    pulseF:0.0002+Math.random()*0.0004,
    ph:Math.random()*Math.PI*2,
    curve:(Math.random()-0.5)*0.0009,
  }
}

// Signed distance functions (negative inside) — iq's classics
function sdShape(kind:Kind, px:number, py:number, r:number):number{
  if(kind==="circle") return Math.sqrt(px*px+py*py)-r
  if(kind==="square") return Math.max(Math.abs(px),Math.abs(py))-r
  if(kind==="tri"){
    const k=1.7320508
    px=Math.abs(px)-r
    py=py+r/k
    if(px+k*py>0){ const t=(px-k*py)/2; py=(-k*px-py)/2; px=t }
    px-=Math.max(-2*r,Math.min(0,px))
    return -Math.sqrt(px*px+py*py)*Math.sign(py)
  }
  // hex
  const kx=-0.866025404, ky=0.5, kz=0.577350269
  px=Math.abs(px); py=Math.abs(py)
  const d=2*Math.min(kx*px+ky*py,0)
  px-=d*kx; py-=d*ky
  const dx=px-Math.max(-kz*r,Math.min(kz*r,px)), dy=py-r
  return Math.sign(dy)*Math.sqrt(dx*dx+dy*dy)
}

function ramp(dimHex:string,colorHex:string):string[]{
  const dim=hexToRgb(dimHex), c=hexToRgb(colorHex)
  return Array.from({length:QL+1},(_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
}

export default function TextArtGeo() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const rowsR = useRef<Row[]>([])
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)
  const timeR = useRef(0)
  const p = usePattern()
  // Snapshot refs so exportSVG can read the live frame without a re-render
  const shapesR = useRef<Shape[]>([])
  const cwR = useRef(12)
  const chR = useRef(16)
  const mEffR = useRef<{s:Shape;cos:number;sin:number;R:number}[]>([])

  // Shape controls — every attribute is adjustable, live, and persisted
  const [count, setCount] = usePersisted("geo-count",6)
  const [sizeMul, setSizeMul] = usePersisted("geo-size",1.45)
  const [speedMul, setSpeedMul] = usePersisted("geo-speed",0)
  const [spinMul, setSpinMul] = usePersisted("geo-spin",0.1)
  const [pulseMul, setPulseMul] = usePersisted("geo-pulse",0.45)
  const [curveMul, setCurveMul] = usePersisted("geo-curve",1)
  const [kindsOn, setKindsOn] = usePersisted<Record<Kind,boolean>>("geo-kinds",{circle:true,square:true,tri:true,hex:true})
  const [showShapes, setShowShapes] = usePersisted("geo-show-shapes",true)
  const [showText, setShowText] = usePersisted("geo-show-text",false)
  const [textSize, setTextSize] = usePersisted("geo-text-size",1.45)
  const [rerender, setRerender] = usePersisted("geo-rerender",true)
  const [rerenderSecs, setRerenderSecs] = usePersisted("geo-rerender-secs",2)
  const ext = useRef({count,sizeMul,speedMul,spinMul,pulseMul,curveMul,kindsOn,showShapes,showText,textSize,rerender,rerenderSecs})
  ext.current = {count,sizeMul,speedMul,spinMul,pulseMul,curveMul,kindsOn,showShapes,showText,textSize,rerender,rerenderSecs}
  const resizeRef = useRef<(()=>void)|null>(null)
  useEffect(()=>{ resizeRef.current?.() },[textSize])
  // Colors dealt round-robin from a shuffled deck — no same-color clusters
  const deck = useRef({order:[0,1,2,3].sort(()=>Math.random()-0.5), i:0})

  const fillsR = useRef<{bg:string;fills:string[][]}>({bg:"",fills:[]})
  fillsR.current = {bg:p.pal.bg, fills: p.pal.rows.map(c=>ramp(p.pal.dim,c))}

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    let shapes:Shape[]=[]
    let CW=12, CH=16, FONTS="11px monospace"
    let regenAcc=0
    let salt=0
    const roll=(W:number,H:number,fromEdge:boolean)=>{
      const on=ext.current.kindsOn
      const pool=KINDS.filter(k=>on[k])
      const d=deck.current
      if(d.i>=d.order.length){ d.order.sort(()=>Math.random()-0.5); d.i=0 }
      return rollShape(W,H,fromEdge,pool.length?pool:KINDS,d.order[d.i++])
    }

    // Glyph sprites: (char, fill) rendered once — fillText per cell per
    // frame is far too slow at this density
    const cache = new Map<string,HTMLCanvasElement>()
    const glyph = (ch:string, fill:string)=>{
      const key=ch+"|"+fill+"|"+CW
      let c=cache.get(key)
      if(!c){
        if(cache.size>20000) cache.clear()
        const dpr=window.devicePixelRatio||1
        c=document.createElement("canvas")
        c.width=CW*dpr; c.height=CH*dpr
        const g=c.getContext("2d")!
        g.scale(dpr,dpr)
        g.font=FONTS
        g.textAlign="center"; g.textBaseline="middle"
        g.fillStyle=fill
        g.fillText(ch,CW/2,CH/2)
        cache.set(key,c)
      }
      return c
    }

    const resize = ()=>{
      const ts=ext.current.textSize
      CW=Math.max(6,Math.round(12*ts))
      CH=Math.max(8,Math.round(16*ts))
      cwR.current=CW; chR.current=CH
      FONTS=`${Math.max(6,Math.round(11*ts))}px monospace`
      cache.clear()
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
      const nRows=Math.ceil(H/CH)+1
      const rows:Row[]=[]
      let prevColor=-1
      for(let r=0;r<nRows;r++){
        let seed=((r+salt*1013)*2654435761)>>>0
        seed^=seed>>>15; seed=Math.imul(seed,2246822519)>>>0; seed^=seed>>>13
        const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
        const nSlots=Math.ceil(W/CW)+1
        const slots:Slot[]=[]
        let rowColor=Math.floor(rand()*(N_COLORS-1))
        if(rowColor>=prevColor) rowColor++
        if(rowColor>=N_COLORS) rowColor=0
        prevColor=rowColor
        let strand=rowColor
        let strandLeft=0
        for(let i=0;i<nSlots;i++){
          if(strandLeft<=0){
            strand = rand()<0.22 ? Math.floor(rand()*N_COLORS) : rowColor
            strandLeft = 6+Math.floor(rand()*14)
          }
          slots.push({x:i*CW, level:0, color:strand, jit:rand()})
          strandLeft--
        }
        rows.push({y:r*CH+CH/2,rowIdx:r,slots,segs:[]})
      }
      rowsR.current=rows
      blobsR.current=[
        {x:W*.30,y:H*.40,vx:.40,vy:.28,angle:0,  angleSpeed: .004,radiusX:W*.55,radiusY:H*.58},
        {x:W*.70,y:H*.55,vx:-.30,vy:.35,angle:1.2,angleSpeed:-.003,radiusX:W*.48,radiusY:H*.52},
        {x:W*.50,y:H*.20,vx:.22,vy:-.42,angle:2.5,angleSpeed: .005,radiusX:W*.44,radiusY:H*.46},
        {x:W*.18,y:H*.72,vx:-.35,vy:-.22,angle:.8,angleSpeed:-.004,radiusX:W*.50,radiusY:H*.54},
      ]
      // Fresh random cast on resize; replacements roll in from the edges
      shapes=Array.from({length:ext.current.count},()=>roll(W,H,false))
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      const {mode,speed,rowVar,ease,steps}=p.ctl.current
      const sd=delta*speed
      timeR.current+=dt*speed
      for(const b of blobsR.current){
        b.x+=b.vx*sd;b.y+=b.vy*sd;b.angle+=b.angleSpeed*sd
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*sd;r.life+=0.04*sd}
      const ec=ext.current
      while(shapes.length<ec.count) shapes.push(roll(W,H,true))
      if(shapes.length>ec.count) shapes.length=ec.count
      for(let i=0;i<shapes.length;i++){
        const s=shapes[i]
        // Curved paths: each shape's velocity slowly veers at its own rate
        const ca=s.curve*sd*ec.curveMul, cc=Math.cos(ca), cs=Math.sin(ca)
        const nvx=s.vx*cc-s.vy*cs, nvy=s.vx*cs+s.vy*cc
        s.vx=nvx; s.vy=nvy
        s.x+=s.vx*sd*ec.speedMul; s.y+=s.vy*sd*ec.speedMul
        s.angle+=s.va*sd*16.667*ec.spinMul
        const rr=s.R*ec.sizeMul
        // Fully off-canvas → replaced by a brand new roll entering elsewhere
        if(s.x<-rr*1.6||s.x>W+rr*1.6||s.y<-rr*1.6||s.y>H+rr*1.6){
          shapes[i]=roll(W,H,true)
        }
      }

      // Re-render mode: every interval the whole composition re-rolls —
      // new shapes, new row randomization — while motion runs continuously
      if(ec.rerender){
        regenAcc+=dt
        if(regenAcc>=ec.rerenderSecs*1000){
          regenAcc=0
          salt++
          resize()
        }
      }else{
        regenAcc=0
      }

      const {bg,fills}=fillsR.current
      const nf=fills.length
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y

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

      const mEff=shapes.map(s=>({
        s,cos:Math.cos(s.angle),sin:Math.sin(s.angle),
        R:s.R*ec.sizeMul*(1+s.pulseA*ec.pulseMul*Math.sin(timeR.current*s.pulseF+s.ph)),
      }))
      shapesR.current=shapes
      mEffR.current=mEff

      for(const row of rowsR.current){
        const rh=((row.rowIdx*2654435761)>>>0)%1000/1000
        const drift = mode==="slide"
          ? Math.sin(timeR.current*0.0014*(0.4+0.6*rh)+row.rowIdx*1.7)*(80+140*rh)*rowVar
          : Math.sin(timeR.current*0.0007*(0.3+0.7*rh)+row.rowIdx*1.7)*(50+90*rh)*rowVar
        const rowBias = row.rowIdx%2===0 ? 0.0 : 0.22
        const cy=row.y

        if(mode==="slide"){
          const slots=row.slots
          const targets:{L:number;R:number}[]=[]
          let start=-1
          for(let i=0;i<=slots.length;i++){
            const cx=i<slots.length ? slots[i].x+CW/2 : 0
            const on = i<slots.length && influenceAt(cx+drift,cy,cx) > 0.30+rowBias
            if(on){ if(start<0) start=i }
            else if(start>=0){
              targets.push({L:slots[start].x, R:slots[i-1].x+CW})
              start=-1
            }
          }
          for(const sg of row.segs) sg.matched=false
          for(const t of targets){
            const tc=(t.L+t.R)/2
            let best:Seg|null=null, bd=260
            for(const sg of row.segs){
              if(sg.matched||sg.dying) continue
              const d=Math.abs((sg.L+sg.R)/2-tc)
              if(d<bd){ bd=d; best=sg }
            }
            if(best){ best.matched=true; best.tL=t.L; best.tR=t.R }
            else row.segs.push({L:tc,R:tc,tL:t.L,tR:t.R,birth:0,dying:false,matched:true})
          }
          for(const sg of row.segs){
            if(!sg.matched) sg.dying=true
            sg.birth+=(sg.dying?-0.07:0.09)*delta
            if(sg.birth>1) sg.birth=1
            const k=Math.min(1,0.05*delta*ease)
            sg.L+=(sg.tL-sg.L)*k; sg.R+=(sg.tR-sg.R)*k
          }
          row.segs=row.segs.filter(sg=>sg.birth>0)
          const q=(b:number)=>Math.round(Math.max(0,Math.min(1,b))*(steps-1))/(steps-1)
          for(const slot of row.slots){
            const cx=slot.x+CW/2
            let lv=0
            for(const sg of row.segs) if(cx>=sg.L-1&&cx<=sg.R+1) lv=Math.max(lv,q(sg.birth))
            slot.level=lv
          }
        }else{
          for(const slot of row.slots){
            const cx=slot.x+CW/2
            const inf=influenceAt(cx+drift,cy,cx)
            const target=Math.max(0,Math.min(1,(inf-(0.30+rowBias))/0.12+0.5))
            slot.level=advance(slot.level,target)
          }
        }

        // Render: level → glyph density + color ramp, jittered per cell
        const ry=cy-CH/2
        for(const slot of row.slots){
          // Intercepted: inside a shape, the cell renders the shape's
          // character (same grid, same size) instead of the field glyph
          const scx=slot.x+CW/2
          let best=0, bm:typeof mEff[number]|null=null
          if(ec.showShapes) for(const e of mEff){
            const dx=scx-e.s.x,dy=cy-e.s.y
            if(Math.abs(dx)>e.R*1.7||Math.abs(dy)>e.R*1.7) continue
            const lx=dx*e.cos+dy*e.sin,ly=-dx*e.sin+dy*e.cos
            const inside=-sdShape(e.s.kind,lx,ly,e.R)
            if(inside>best){ best=inside; bm=e }
          }
          if(bm){
            ctx.drawImage(glyph(bm.s.ch,fills[bm.s.color%nf][QL]),slot.x,ry,CW,CH)
            continue
          }
          if(!ec.showText) continue
          const gi=Math.max(0,Math.min(GLYPHS.length-1,
            Math.floor(slot.level*(GLYPHS.length-1)+slot.jit*1.6-0.3)))
          const q=Math.round(slot.level*QL)
          ctx.drawImage(glyph(GLYPHS[gi],fills[slot.color%nf][q]),slot.x,ry,CW,CH)
        }
      }

    }

    resizeRef.current=resize
    resize(); raf.current=requestAnimationFrame(frame)
    window.addEventListener("resize",resize)
    canvas.addEventListener("mousemove",e=>{mouse.current={x:e.clientX,y:e.clientY}})
    canvas.addEventListener("mouseleave",()=>{mouse.current={x:-9999,y:-9999}})
    canvas.addEventListener("click",e=>{
      for(let i=0;i<2;i++) ripplesR.current.push({x:e.clientX,y:e.clientY,radius:i*28,life:0})
    })
    return ()=>{ cancelAnimationFrame(raf.current); window.removeEventListener("resize",resize) }
  },[])

  const exportSVG = ()=>{
    const W = window.innerWidth, H = window.innerHeight
    const CW = cwR.current
    const fs = Math.max(6, Math.round(11 * ext.current.textSize))
    const {bg, fills} = fillsR.current
    const nf = fills.length
    const ec = ext.current
    const mEff = mEffR.current
    const rows = rowsR.current

    const lines: string[] = []
    lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`)
    lines.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`)
    lines.push(`<g font-family="monospace" font-size="${fs}" text-anchor="middle" dominant-baseline="middle">`)

    for(const row of rows){
      const cy = row.y
      for(const slot of row.slots){
        const scx = slot.x + CW/2
        // Check if inside a shape
        let best = 0, bm: typeof mEff[number]|null = null
        if(ec.showShapes) for(const e of mEff){
          const dx=scx-e.s.x, dy=cy-e.s.y
          if(Math.abs(dx)>e.R*1.7||Math.abs(dy)>e.R*1.7) continue
          const lx=dx*e.cos+dy*e.sin, ly=-dx*e.sin+dy*e.cos
          const inside=-sdShape(e.s.kind,lx,ly,e.R)
          if(inside>best){ best=inside; bm=e }
        }
        if(bm){
          const fill = fills[bm.s.color % nf][QL]
          const ch = bm.s.ch.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
          lines.push(`<text x="${scx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${fill}">${ch}</text>`)
          continue
        }
        if(!ec.showText) continue
        if(slot.level <= 0) continue
        const gi = Math.max(0, Math.min(GLYPHS.length-1,
          Math.floor(slot.level*(GLYPHS.length-1)+slot.jit*1.6-0.3)))
        const q = Math.round(slot.level * QL)
        const fill = fills[slot.color % nf][q]
        const ch = GLYPHS[gi].replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
        lines.push(`<text x="${scx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${fill}">${ch}</text>`)
      }
    }

    lines.push(`</g></svg>`)
    const blob = new Blob([lines.join("\n")], {type:"image/svg+xml"})
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href=url; a.download="text-art-geo.svg"
    a.click()
    setTimeout(()=>URL.revokeObjectURL(url), 1000)
  }

  const slider=(label:string,value:number,set:(v:number)=>void,min:number,max:number,step:number,fmt=(v:number)=>v.toFixed(2)+"x")=>(    <label key={label} className="flex flex-col gap-1.5">
      <span className="flex justify-between"><span>{label}</span><span className="text-white">{fmt(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>set(Number(e.target.value))} className="w-full accent-[#3ECF8E]" />
    </label>
  )

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
      <PatternPanel p={p} anim="full">
        <div className="text-white/40 mt-1">Export</div>
        <button onClick={exportSVG}
          className="w-full px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
          Export SVG
        </button>
        <div className="text-white/40 mt-1">Shapes</div>
        {slider("Text size",textSize,setTextSize,0.7,2.2,0.05)}
        <div className="flex gap-1 items-stretch">
          <button onClick={()=>setRerender(!rerender)}
            className={["flex-1 px-2 py-1.5 border transition-colors",
              rerender ? "bg-white text-black border-white"
              : "border-white/20 text-white/40 hover:text-white hover:border-white/60"].join(" ")}>
            Re-render
          </button>
        </div>
        <div className={rerender?"":"opacity-30 pointer-events-none"}>
          {slider("Every",rerenderSecs,setRerenderSecs,0.5,10,0.5,v=>v.toFixed(1)+"s")}
        </div>
        {slider("Count",count,setCount,1,12,1,v=>String(v))}
        {slider("Size",sizeMul,setSizeMul,0.3,2.2,0.05)}
        {slider("Speed",speedMul,setSpeedMul,0,3,0.05)}
        {slider("Spin",spinMul,setSpinMul,0,3,0.05)}
        {slider("Pulse",pulseMul,setPulseMul,0,2.5,0.05)}
        {slider("Curve",curveMul,setCurveMul,0,3,0.05)}
        <div className="grid grid-cols-2 gap-1">
          <button onClick={()=>setShowShapes(!showShapes)}
            className={["px-2 py-1.5 border transition-colors",
              showShapes ? "bg-white text-black border-white"
              : "border-white/20 text-white/40 hover:text-white hover:border-white/60"].join(" ")}>
            Shapes
          </button>
          <button onClick={()=>setShowText(!showText)}
            className={["px-2 py-1.5 border transition-colors",
              showText ? "bg-white text-black border-white"
              : "border-white/20 text-white/40 hover:text-white hover:border-white/60"].join(" ")}>
            Text
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1">
          {KINDS.map(k=>(
            <button key={k} onClick={()=>setKindsOn({...kindsOn,[k]:!kindsOn[k]})}
              className={["px-1 py-1.5 border transition-colors",
                kindsOn[k] ? "bg-white text-black border-white"
                : "border-white/20 text-white/40 hover:text-white hover:border-white/60"].join(" ")}>
              {k}
            </button>
          ))}
        </div>
      </PatternPanel>
    </>
  )
}
