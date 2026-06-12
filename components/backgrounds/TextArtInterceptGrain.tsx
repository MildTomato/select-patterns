"use client"

import { useEffect, useRef } from "react"
import { usePattern, PatternPanel, hexToRgb } from "@/components/PatternControls"

interface Slot { x:number;level:number;color:number;jit:number }
interface Seg { L:number;R:number;tL:number;tR:number;birth:number;dying:boolean;matched?:boolean }
interface Row { y:number;rowIdx:number;slots:Slot[];segs:Seg[] }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// Intercept + grain: the row field cut by large character-shapes, all
// sitting on a frame-stable film-grain underlay of the same blob field.
const N_COLORS = 4
const QL = 32
const UNIT = 12
const ROW_SPACING = 16
const FONT = "11px monospace"
// Density ramp, sparse → dense; per-cell jitter keeps the texture organic
const GLYPHS = [".","·",":",";","-","~","=","+","*","x","#","%","@"]

// Grain underlay
const GRAIN = 2
const CS = 16
function hash(x:number,y:number,seed:number){
  let n=Math.imul(x,1597334677)^Math.imul(y,3812015801)^Math.imul(seed,2654435761)
  n=Math.imul(n^(n>>>15),2246822519)
  n=Math.imul(n^(n>>>13),3266489917)
  return ((n^(n>>>16))>>>0)/4294967296
}

// Intercepting shapes — rendered in the same grid as the rows
interface Macro { ch:string;x:number;y:number;vx:number;vy:number;angle:number;va:number;rx:number;ry:number;color:number }

function ramp(dimHex:string,colorHex:string):string[]{
  const dim=hexToRgb(dimHex), c=hexToRgb(colorHex)
  return Array.from({length:QL+1},(_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
}

export default function TextArtInterceptGrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const rowsR = useRef<Row[]>([])
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)
  const timeR = useRef(0)
  const p = usePattern()
  const fillsR = useRef<{bg:string;fills:string[][]}>({bg:"",fills:[]})
  fillsR.current = {bg:p.pal.bg, fills: p.pal.rows.map(c=>ramp(p.pal.dim,c))}

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    let macro:Macro[]=[]
    const low=document.createElement("canvas")
    const lowCtx=low.getContext("2d")!
    let img:ImageData|null=null
    let vF=new Float32Array(0)
    let fw=0,fh=0,lowW=0,lowH=0

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
        c.width=UNIT*dpr; c.height=ROW_SPACING*dpr
        const g=c.getContext("2d")!
        g.scale(dpr,dpr)
        g.font=FONT
        g.textAlign="center"; g.textBaseline="middle"
        g.fillStyle=fill
        g.fillText(ch,UNIT/2,ROW_SPACING/2)
        cache.set(key,c)
      }
      return c
    }

    const resize = ()=>{
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
      lowW=Math.ceil(W/GRAIN); lowH=Math.ceil(H/GRAIN)
      low.width=lowW; low.height=lowH
      img=lowCtx.createImageData(lowW,lowH)
      fw=Math.ceil(W/CS)+2; fh=Math.ceil(H/CS)+2
      vF=new Float32Array(fw*fh)
      const nRows=Math.ceil(H/ROW_SPACING)+1
      const rows:Row[]=[]
      let prevColor=-1
      for(let r=0;r<nRows;r++){
        let seed=(r*2654435761)>>>0
        seed^=seed>>>15; seed=Math.imul(seed,2246822519)>>>0; seed^=seed>>>13
        const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
        const nSlots=Math.ceil(W/UNIT)+1
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
          slots.push({x:i*UNIT, level:0, color:strand, jit:rand()})
          strandLeft--
        }
        rows.push({y:r*ROW_SPACING+ROW_SPACING/2,rowIdx:r,slots,segs:[]})
      }
      rowsR.current=rows
      blobsR.current=[
        {x:W*.30,y:H*.40,vx:.40,vy:.28,angle:0,  angleSpeed: .004,radiusX:W*.55,radiusY:H*.58},
        {x:W*.70,y:H*.55,vx:-.30,vy:.35,angle:1.2,angleSpeed:-.003,radiusX:W*.48,radiusY:H*.52},
        {x:W*.50,y:H*.20,vx:.22,vy:-.42,angle:2.5,angleSpeed: .005,radiusX:W*.44,radiusY:H*.46},
        {x:W*.18,y:H*.72,vx:-.35,vy:-.22,angle:.8,angleSpeed:-.004,radiusX:W*.50,radiusY:H*.54},
      ]
      // Interweaving character-shapes — slow drift, wrapping in and out
      // of frame; mixed scales and aspects, from broad masses to thin bars
      macro=[
        {ch:"[",x:W*.25,y:H*.30,vx:.13,vy:.05, angle:.3, va:.00035,rx:W*.24,ry:H*.30,color:3},
        {ch:"{",x:W*.72,y:H*.62,vx:-.11,vy:.07,angle:1.1,va:-.00028,rx:W*.18,ry:H*.34,color:0},
        {ch:"|",x:W*.50,y:H*.15,vx:.08,vy:-.10,angle:2.0,va:.00030,rx:W*.34,ry:H*.13,color:2},
        {ch:"=",x:W*.85,y:H*.80,vx:-.15,vy:-.04,angle:.8, va:-.00040,rx:W*.20,ry:H*.24,color:1},
        {ch:"/",x:W*.10,y:H*.55,vx:.10,vy:.08, angle:2.6,va:.00025,rx:W*.30,ry:H*.10,color:3},
        {ch:"(",x:W*.42,y:H*.85,vx:-.07,vy:-.11,angle:1.6,va:-.00030,rx:W*.13,ry:H*.18,color:0},
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
      for(const m of macro){
        m.x+=m.vx*sd; m.y+=m.vy*sd; m.angle+=m.va*sd*16.667
        if(m.x<-m.rx*1.3) m.x=W+m.rx*1.2
        if(m.x>W+m.rx*1.3) m.x=-m.rx*1.2
        if(m.y<-m.ry*1.3) m.y=H+m.ry*1.2
        if(m.y>H+m.ry*1.3) m.y=-m.ry*1.2
      }

      const {fills}=fillsR.current
      const nf=fills.length

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

      // Grain underlay: coarse field samples, bilinear per pixel, stochastic
      // dither between palette stops with a frame-stable noise pattern
      if(img){
        const pal=p.palR.current
        const bgRgb=hexToRgb(pal.bg)
        const stops=[bgRgb,hexToRgb(pal.dim),...pal.rows.map(hexToRgb)]
          .map((c,si)=> si===0?c:[(c[0]+bgRgb[0])>>1,(c[1]+bgRgb[1])>>1,(c[2]+bgRgb[2])>>1] as [number,number,number])
        const top=stops.length-1
        for(let j=0;j<fh;j++){
          const gy2=j*CS
          for(let i=0;i<fw;i++){
            const gx2=i*CS
            vF[j*fw+i]=Math.min(1,influenceAt(gx2,gy2,gx2)*0.8)**1.3
          }
        }
        const d=img.data
        let ptr=0
        for(let y=0;y<lowH;y++){
          const gy=(y*GRAIN)/CS
          const j0=Math.min(fh-2,gy|0), ty=gy-j0
          const r0=j0*fw, r1=(j0+1)*fw
          for(let x=0;x<lowW;x++){
            const gx=(x*GRAIN)/CS
            const i0=Math.min(fw-2,gx|0), tx=gx-i0
            const v00=vF[r0+i0],v10=vF[r0+i0+1],v01=vF[r1+i0],v11=vF[r1+i0+1]
            let v=(v00+(v10-v00)*tx)*(1-ty)+(v01+(v11-v01)*tx)*ty
            v+=(hash(x,y,1)-0.5)*0.14
            if(v<0)v=0; else if(v>1)v=1
            const t=v*top
            let ii=t|0; if(ii>top-1)ii=top-1
            const idx=ii+(hash(x,y,2)<t-ii?1:0)
            const c=stops[idx]
            d[ptr]=c[0];d[ptr+1]=c[1];d[ptr+2]=c[2];d[ptr+3]=255
            ptr+=4
          }
        }
        lowCtx.putImageData(img,0,0)
        ctx.imageSmoothingEnabled=false
        ctx.drawImage(low,0,0,W,H)
      }

      // Per-frame shape state: trig + a slow radius pulse for organic edges
      const mEff=macro.map((m,k)=>{
        const pu=1+0.10*Math.sin(timeR.current*0.0004+k*2.1)
        return {m,cos:Math.cos(m.angle),sin:Math.sin(m.angle),rx:m.rx*pu,ry:m.ry*pu}
      })

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
            const cx=i<slots.length ? slots[i].x+UNIT/2 : 0
            const on = i<slots.length && influenceAt(cx+drift,cy,cx) > 0.30+rowBias
            if(on){ if(start<0) start=i }
            else if(start>=0){
              targets.push({L:slots[start].x, R:slots[i-1].x+UNIT})
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
            const cx=slot.x+UNIT/2
            let lv=0
            for(const sg of row.segs) if(cx>=sg.L-1&&cx<=sg.R+1) lv=Math.max(lv,q(sg.birth))
            slot.level=lv
          }
        }else{
          for(const slot of row.slots){
            const cx=slot.x+UNIT/2
            const inf=influenceAt(cx+drift,cy,cx)
            const target=Math.max(0,Math.min(1,(inf-(0.30+rowBias))/0.12+0.5))
            slot.level=advance(slot.level,target)
          }
        }

        // Render: level → glyph density + color ramp, jittered per cell
        const ry=cy-ROW_SPACING/2
        for(const slot of row.slots){
          // Intercepted: inside a shape, the cell renders the shape's
          // character (same grid, same size) instead of the field glyph
          const scx=slot.x+UNIT/2
          let best=0.04, bm:typeof mEff[number]|null=null
          for(const e of mEff){
            const dx=scx-e.m.x,dy=cy-e.m.y
            const lx=dx*e.cos+dy*e.sin,ly=-dx*e.sin+dy*e.cos
            const d=1-Math.sqrt((lx/e.rx)**2+(ly/e.ry)**2)
            if(d>best){ best=d; bm=e }
          }
          if(bm){
            ctx.drawImage(glyph(bm.m.ch,fills[bm.m.color%nf][QL]),slot.x,ry,UNIT,ROW_SPACING)
            continue
          }
          const gi=Math.max(0,Math.min(GLYPHS.length-1,
            Math.floor(slot.level*(GLYPHS.length-1)+slot.jit*1.6-0.3)))
          const q=Math.round(slot.level*QL)
          ctx.drawImage(glyph(GLYPHS[gi],fills[slot.color%nf][q]),slot.x,ry,UNIT,ROW_SPACING)
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
      <PatternPanel p={p} anim="full" />
    </>
  )
}
