"use client"

import { useEffect, useRef, useState } from "react"
import { usePattern, PatternPanel, hexToRgb, usePersisted } from "@/components/PatternControls"

interface Slot { x:number;level:number;color:number;jit:number }
interface Seg { L:number;R:number;tL:number;tR:number;birth:number;dying:boolean;matched?:boolean }
interface Row { y:number;rowIdx:number;slots:Slot[];segs:Seg[] }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// Liquid intercept: each intercepting mass is a metaball cluster — a few
// invisible lobes orbiting a drifting center; coverage is the thresholded
// sum of their fields, so masses bulge, pinch, split and merge like fluid.
const N_COLORS = 4
const QL = 32
// Density ramp, sparse → dense; per-cell jitter keeps the texture organic
const GLYPHS = [".","·",":",";","-","~","=","+","*","x","#","%","@"]

// Intercepting liquid masses — rendered in the same grid as the rows
interface Lobe { orbRx:number;orbRy:number;sp:number;ph:number;R:number }
interface Mass { ch:string;color:number;x:number;y:number;vx:number;vy:number;lobes:Lobe[] }

function ramp(dimHex:string,colorHex:string):string[]{
  const dim=hexToRgb(dimHex), c=hexToRgb(colorHex)
  return Array.from({length:QL+1},(_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
}

export default function TextArtFluid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const rowsR = useRef<Row[]>([])
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)
  const timeR = useRef(0)
  const p = usePattern()
  // Page-local liquid + typography controls
  const [textSize, setTextSize] = usePersisted("fluid-textSize",1)
  const [flow, setFlow] = usePersisted("fluid-flow",1.6)
  const [blobSize, setBlobSize] = usePersisted("fluid-blobSize",1)
  const [spread, setSpread] = usePersisted("fluid-spread",1.3)
  const ext = useRef({textSize, flow, blobSize, spread})
  ext.current = {textSize, flow, blobSize, spread}
  const resizeRef = useRef<(()=>void)|null>(null)
  useEffect(()=>{ resizeRef.current?.() },[textSize])

  const fillsR = useRef<{bg:string;fills:string[][]}>({bg:"",fills:[]})
  fillsR.current = {bg:p.pal.bg, fills: p.pal.rows.map(c=>ramp(p.pal.dim,c))}

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    let masses:Mass[]=[]
    let CW=12, CH=16, FONTS="11px monospace"

    // Glyph sprites: (char, fill) rendered once — fillText per cell per
    // frame is far too slow at this density
    const cache = new Map<string,HTMLCanvasElement>()
    const glyph = (ch:string, fill:string)=>{
      const key=ch+"|"+fill
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
        let seed=(r*2654435761)>>>0
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
      // Liquid masses: drifting centers, each carrying orbiting lobes —
      // the lobes\' merged metaball field is the shape
      masses=[
        {ch:"{",color:0,x:W*.28,y:H*.32,vx:.09,vy:.04,lobes:[
          {orbRx:W*.055,orbRy:H*.05,sp:.42,ph:0.0,R:W*.105},
          {orbRx:W*.10, orbRy:H*.08,sp:.30,ph:2.1,R:W*.075},
          {orbRx:W*.05, orbRy:H*.11,sp:.62,ph:4.2,R:W*.065},
        ]},
        {ch:"|",color:2,x:W*.70,y:H*.25,vx:-.07,vy:.06,lobes:[
          {orbRx:W*.08, orbRy:H*.04,sp:.36,ph:1.0,R:W*.095},
          {orbRx:W*.12, orbRy:H*.06,sp:.52,ph:3.4,R:W*.06},
          {orbRx:W*.04, orbRy:H*.09,sp:.74,ph:5.1,R:W*.055},
        ]},
        {ch:"(",color:1,x:W*.55,y:H*.72,vx:.06,vy:-.05,lobes:[
          {orbRx:W*.07, orbRy:H*.06,sp:.33,ph:0.7,R:W*.10},
          {orbRx:W*.11, orbRy:H*.05,sp:.47,ph:2.8,R:W*.07},
          {orbRx:W*.05, orbRy:H*.10,sp:.68,ph:4.9,R:W*.06},
        ]},
        {ch:"/",color:3,x:W*.15,y:H*.70,vx:-.05,vy:-.07,lobes:[
          {orbRx:W*.09, orbRy:H*.07,sp:.40,ph:1.6,R:W*.085},
          {orbRx:W*.05, orbRy:H*.04,sp:.58,ph:3.9,R:W*.065},
        ]},
      ]
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
      const wrapR=W*0.25
      for(const m of masses){
        m.x+=m.vx*sd; m.y+=m.vy*sd
        if(m.x<-wrapR*1.3) m.x=W+wrapR*1.2
        if(m.x>W+wrapR*1.3) m.x=-wrapR*1.2
        if(m.y<-wrapR*1.3) m.y=H+wrapR*1.2
        if(m.y>H+wrapR*1.3) m.y=-wrapR*1.2
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

      // Per-frame lobe positions: each lobe orbits its mass center.
      // Flow = orbit speed, Spread = orbit radius, Size = lobe radius.
      const {flow,blobSize,spread}=ext.current
      const t3=timeR.current*0.001*flow
      const mEff=masses.map(m=>({
        m,
        pts:m.lobes.map(l=>({
          x:m.x+Math.cos(t3*l.sp+l.ph)*l.orbRx*spread,
          y:m.y+Math.sin(t3*l.sp*1.13+l.ph)*l.orbRy*spread,
          R2:(l.R*blobSize)**2,
        })),
      }))

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
          // Metaball field: sum of lobe contributions per mass; the mass
          // with the strongest field above 1 claims the cell
          let best=1.0, bm:typeof mEff[number]|null=null
          for(const e of mEff){
            let f=0
            for(const pt of e.pts){
              const dx=scx-pt.x, dy=cy-pt.y
              f+=pt.R2/(dx*dx+dy*dy+1)
            }
            if(f>best){ best=f; bm=e }
          }
          if(bm){
            ctx.drawImage(glyph(bm.m.ch,fills[bm.m.color%nf][QL]),slot.x,ry,CW,CH)
            continue
          }
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

  const slider=(label:string,value:number,set:(v:number)=>void,min:number,max:number,step:number,suffix="x")=>(
    <label key={label} className="flex flex-col gap-1.5">
      <span className="flex justify-between"><span>{label}</span><span className="text-white">{value.toFixed(2)}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>set(Number(e.target.value))} className="w-full accent-[#3ECF8E]" />
    </label>
  )

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
      <PatternPanel p={p} anim="full">
        <div className="text-white/40 mt-1">Liquid</div>
        {slider("Text size",textSize,setTextSize,0.7,2.2,0.05)}
        {slider("Flow",flow,setFlow,0.2,4,0.05)}
        {slider("Blob size",blobSize,setBlobSize,0.6,1.6,0.02)}
        {slider("Spread",spread,setSpread,0.5,2,0.05)}
      </PatternPanel>
    </>
  )
}
