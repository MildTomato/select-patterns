"use client"

import { useEffect, useRef, useState } from "react"
import { usePattern, PatternPanel, hexToRgb, usePersisted } from "@/components/PatternControls"

interface Slot { x:number;level:number;color:number;jit:number }
interface Row { y:number;rowIdx:number;slots:Slot[] }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// REAL fluid: Jos Stam's "Stable Fluids" — an actual Navier-Stokes solver
// (semi-Lagrangian advection, pressure projection, vorticity confinement)
// running on a coarse grid. Three dye fields are carried by the velocity
// field; where dye concentration crosses a threshold, the glyph grid
// renders that mass's character. The cursor stirs the fluid; clicks splat.
const N_COLORS = 4
const QL = 32
const GLYPHS = [".","·",":",";","-","~","=","+","*","x","#","%","@"]

// Simulation grid (interior cells); velocity is in cells/second
const SW = 128
const SH = 72
const SIZE = (SW+2)*(SH+2)
const IX = (x:number,y:number)=>x+(SW+2)*y

// One dye field per liquid mass
const MASSES = [
  {ch:"{", color:0, w:0.21, ph:0.0},
  {ch:"|", color:2, w:0.16, ph:2.1},
  {ch:"(", color:1, w:0.12, ph:4.4},
]

function ramp(dimHex:string,colorHex:string):string[]{
  const dim=hexToRgb(dimHex), c=hexToRgb(colorHex)
  return Array.from({length:QL+1},(_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
}

export default function TextArtLiquid() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999,px:-9999,py:-9999})
  const clicksR = useRef<{x:number,y:number}[]>([])
  const rowsR = useRef<Row[]>([])
  const blobsR = useRef<Blob[]>([])
  const raf = useRef(0)
  const last = useRef(0)
  const timeR = useRef(0)
  const p = usePattern()

  // Page-local liquid + typography controls
  const [textSize, setTextSize] = usePersisted("liquid-textSize",1)
  const [stir, setStir] = usePersisted("liquid-stir",1)
  const [swirl, setSwirl] = usePersisted("liquid-swirl",1)
  const [dyeAmt, setDyeAmt] = usePersisted("liquid-dyeAmt",1)
  const ext = useRef({textSize, stir, swirl, dyeAmt})
  ext.current = {textSize, stir, swirl, dyeAmt}
  const resizeRef = useRef<(()=>void)|null>(null)
  useEffect(()=>{ resizeRef.current?.() },[textSize])

  const fillsR = useRef<{bg:string;fills:string[][]}>({bg:"",fills:[]})
  fillsR.current = {bg:p.pal.bg, fills: p.pal.rows.map(c=>ramp(p.pal.dim,c))}

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    let CW=12, CH=16, FONTS="11px monospace"

    // ── Fluid solver state ───────────────────────────────────────────
    const u=new Float32Array(SIZE), v=new Float32Array(SIZE)
    const u0=new Float32Array(SIZE), v0=new Float32Array(SIZE)
    const pr=new Float32Array(SIZE), dv=new Float32Array(SIZE)
    const curl=new Float32Array(SIZE)
    const dyes=MASSES.map(()=>new Float32Array(SIZE))
    const dyes0=MASSES.map(()=>new Float32Array(SIZE))

    const set_bnd=(b:number,x:Float32Array)=>{
      for(let i=1;i<=SW;i++){
        x[IX(i,0)]    = b===2 ? -x[IX(i,1)]  : x[IX(i,1)]
        x[IX(i,SH+1)] = b===2 ? -x[IX(i,SH)] : x[IX(i,SH)]
      }
      for(let j=1;j<=SH;j++){
        x[IX(0,j)]    = b===1 ? -x[IX(1,j)]  : x[IX(1,j)]
        x[IX(SW+1,j)] = b===1 ? -x[IX(SW,j)] : x[IX(SW,j)]
      }
      x[IX(0,0)]=0.5*(x[IX(1,0)]+x[IX(0,1)])
      x[IX(0,SH+1)]=0.5*(x[IX(1,SH+1)]+x[IX(0,SH)])
      x[IX(SW+1,0)]=0.5*(x[IX(SW,0)]+x[IX(SW+1,1)])
      x[IX(SW+1,SH+1)]=0.5*(x[IX(SW,SH+1)]+x[IX(SW+1,SH)])
    }

    const lin_solve=(b:number,x:Float32Array,x0:Float32Array,a:number,c:number,iter:number)=>{
      for(let k=0;k<iter;k++){
        for(let j=1;j<=SH;j++){
          for(let i=1;i<=SW;i++){
            x[IX(i,j)]=(x0[IX(i,j)]+a*(x[IX(i-1,j)]+x[IX(i+1,j)]+x[IX(i,j-1)]+x[IX(i,j+1)]))/c
          }
        }
        set_bnd(b,x)
      }
    }

    const project=(uu:Float32Array,vv:Float32Array)=>{
      for(let j=1;j<=SH;j++){
        for(let i=1;i<=SW;i++){
          dv[IX(i,j)]=-0.5*(uu[IX(i+1,j)]-uu[IX(i-1,j)]+vv[IX(i,j+1)]-vv[IX(i,j-1)])
          pr[IX(i,j)]=0
        }
      }
      set_bnd(0,dv); set_bnd(0,pr)
      lin_solve(0,pr,dv,1,4,12)
      for(let j=1;j<=SH;j++){
        for(let i=1;i<=SW;i++){
          uu[IX(i,j)]-=0.5*(pr[IX(i+1,j)]-pr[IX(i-1,j)])
          vv[IX(i,j)]-=0.5*(pr[IX(i,j+1)]-pr[IX(i,j-1)])
        }
      }
      set_bnd(1,uu); set_bnd(2,vv)
    }

    const advect=(b:number,d:Float32Array,d0:Float32Array,uu:Float32Array,vv:Float32Array,dt:number)=>{
      for(let j=1;j<=SH;j++){
        for(let i=1;i<=SW;i++){
          let x=i-dt*uu[IX(i,j)], y=j-dt*vv[IX(i,j)]
          if(x<0.5)x=0.5; if(x>SW+0.5)x=SW+0.5
          if(y<0.5)y=0.5; if(y>SH+0.5)y=SH+0.5
          const i0=x|0,i1=i0+1,j0=y|0,j1=j0+1
          const s1=x-i0,s0=1-s1,t1=y-j0,t0=1-t1
          d[IX(i,j)]=s0*(t0*d0[IX(i0,j0)]+t1*d0[IX(i0,j1)])+s1*(t0*d0[IX(i1,j0)]+t1*d0[IX(i1,j1)])
        }
      }
      set_bnd(b,d)
    }

    const vorticity=(eps:number,dt:number)=>{
      for(let j=1;j<=SH;j++){
        for(let i=1;i<=SW;i++){
          curl[IX(i,j)]=0.5*((v[IX(i+1,j)]-v[IX(i-1,j)])-(u[IX(i,j+1)]-u[IX(i,j-1)]))
        }
      }
      for(let j=2;j<SH;j++){
        for(let i=2;i<SW;i++){
          const Nx=0.5*(Math.abs(curl[IX(i+1,j)])-Math.abs(curl[IX(i-1,j)]))
          const Ny=0.5*(Math.abs(curl[IX(i,j+1)])-Math.abs(curl[IX(i,j-1)]))
          const len=Math.sqrt(Nx*Nx+Ny*Ny)+1e-5
          const w=curl[IX(i,j)]
          u[IX(i,j)]+=eps*dt*(Ny/len)*w
          v[IX(i,j)]-=eps*dt*(Nx/len)*w
        }
      }
    }

    const splat=(arr:Float32Array,cx:number,cy:number,amt:number,rad:number)=>{
      const x0=Math.max(1,Math.floor(cx-rad)), x1=Math.min(SW,Math.ceil(cx+rad))
      const y0=Math.max(1,Math.floor(cy-rad)), y1=Math.min(SH,Math.ceil(cy+rad))
      for(let j=y0;j<=y1;j++){
        for(let i=x0;i<=x1;i++){
          const dx=i-cx,dy=j-cy
          const g=Math.exp(-(dx*dx+dy*dy)/(rad*rad))
          arr[IX(i,j)]+=amt*g
        }
      }
    }

    const sample=(arr:Float32Array,x:number,y:number)=>{
      let sx=x, sy=y
      if(sx<0.5)sx=0.5; if(sx>SW+0.5)sx=SW+0.5
      if(sy<0.5)sy=0.5; if(sy>SH+0.5)sy=SH+0.5
      const i0=sx|0,i1=i0+1,j0=sy|0,j1=j0+1
      const s1=sx-i0,s0=1-s1,t1=sy-j0,t0=1-t1
      return s0*(t0*arr[IX(i0,j0)]+t1*arr[IX(i0,j1)])+s1*(t0*arr[IX(i1,j0)]+t1*arr[IX(i1,j1)])
    }

    // ── Glyph layer ─────────────────────────────────────────────────
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
      FONTS=`${Math.max(6,Math.round(11*ts))}px monospace`
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
        rows.push({y:r*CH+CH/2,rowIdx:r,slots})
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
      const dtMs=Math.min(now-(last.current||now-16),50); last.current=now
      const delta=Math.min(dtMs/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      const {speed,rowVar,steps,mode,ease}=p.ctl.current
      const {stir,swirl,dyeAmt}=ext.current
      const sd=delta*speed
      timeR.current+=dtMs*speed
      const simDt=(dtMs/1000)*speed

      for(const b of blobsR.current){
        b.x+=b.vx*sd;b.y+=b.vy*sd;b.angle+=b.angleSpeed*sd
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }

      // ── Fluid step ─────────────────────────────────────────────────
      if(simDt>0){
        // Emitters: each mass has a slowly orbiting source injecting dye
        // and a tangential push, which the solver turns into currents
        const t=timeR.current*0.001
        for(let k=0;k<MASSES.length;k++){
          const m=MASSES[k]
          const a=t*m.w+m.ph
          const exx=SW*(0.5+0.34*Math.cos(a))
          const eyy=SH*(0.5+0.34*Math.sin(a*0.77+m.ph*0.6))
          const tx=-Math.sin(a), ty=Math.cos(a)
          splat(dyes[k],exx,eyy,dyeAmt*9*simDt,2.4)
          splat(u,exx,eyy,tx*150*simDt,2.6)
          splat(v,exx,eyy,ty*150*simDt,2.6)
        }
        // Cursor stirs the fluid
        const ms=mouse.current
        if(ms.x>-9000&&ms.px>-9000){
          const mxs=ms.x/W*SW, mys=ms.y/H*SH
          const vx=(ms.x-ms.px)/W*SW/Math.max(simDt,0.004)
          const vy=(ms.y-ms.py)/H*SH/Math.max(simDt,0.004)
          const cl=(n:number)=>Math.max(-120,Math.min(120,n))
          splat(u,mxs,mys,cl(vx)*0.35*stir,2.2)
          splat(v,mxs,mys,cl(vy)*0.35*stir,2.2)
        }
        ms.px=ms.x; ms.py=ms.y
        // Clicks: dye burst + radial impulse
        for(const c of clicksR.current){
          const cxs=c.x/W*SW, cys=c.y/H*SH
          const k=Math.floor(Math.random()*MASSES.length)
          splat(dyes[k],cxs,cys,2.2,3.2)
          for(let a=0;a<8;a++){
            const an=a/8*Math.PI*2
            splat(u,cxs+Math.cos(an)*2,cys+Math.sin(an)*2,Math.cos(an)*9,1.6)
            splat(v,cxs+Math.cos(an)*2,cys+Math.sin(an)*2,Math.sin(an)*9,1.6)
          }
        }
        clicksR.current.length=0

        vorticity(swirl*10,simDt)
        project(u,v)
        u0.set(u); v0.set(v)
        advect(1,u,u0,u0,v0,simDt)
        advect(2,v,v0,u0,v0,simDt)
        project(u,v)
        const dis=Math.pow(0.988,60*simDt)
        const vdis=Math.pow(0.9985,60*simDt)
        for(let i=0;i<SIZE;i++){ u[i]*=vdis; v[i]*=vdis }
        for(let k=0;k<dyes.length;k++){
          dyes0[k].set(dyes[k])
          advect(0,dyes[k],dyes0[k],u,v,simDt)
          const dk=dyes[k]
          for(let i=0;i<SIZE;i++) dk[i]*=dis
        }
      }

      // ── Render ─────────────────────────────────────────────────────
      const {bg,fills}=fillsR.current
      const nf=fills.length
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y
      const advance=(level:number,target:number)=>{
        if(mode==="step") return Math.round(target*(steps-1))/(steps-1)
        const e=(target>level?0.25:0.10)*delta*ease
        return level+(target-level)*Math.min(1,e)
      }

      for(const row of rowsR.current){
        const rh=((row.rowIdx*2654435761)>>>0)%1000/1000
        const drift=Math.sin(timeR.current*0.0007*(0.3+0.7*rh)+row.rowIdx*1.7)*(50+90*rh)*rowVar
        const rowBias = row.rowIdx%2===0 ? 0.0 : 0.22
        const cy=row.y
        const ry=cy-CH/2
        const simY=cy/H*SH

        for(const slot of row.slots){
          const cx=slot.x+CW/2
          // Liquid first: sample each dye field at this cell
          const simX=cx/W*SW
          let best=0.24, bk=-1
          for(let k=0;k<dyes.length;k++){
            const c=sample(dyes[k],simX,simY)
            if(c>best){ best=c; bk=k }
          }
          if(bk>=0){
            const m=MASSES[bk]
            const lv=Math.min(1,(best-0.24)/0.6)
            const q=Math.round((0.45+0.55*lv)*QL)
            ctx.drawImage(glyph(m.ch,fills[m.color%nf][q]),slot.x,ry,CW,CH)
            continue
          }
          // Base field
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
          const target=Math.max(0,Math.min(1,(inf-(0.30+rowBias))/0.12+0.5))
          slot.level=advance(slot.level,target)
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
    canvas.addEventListener("mousemove",e=>{ mouse.current.x=e.clientX; mouse.current.y=e.clientY })
    canvas.addEventListener("mouseleave",()=>{ mouse.current.x=-9999; mouse.current.y=-9999; mouse.current.px=-9999; mouse.current.py=-9999 })
    canvas.addEventListener("click",e=>{ clicksR.current.push({x:e.clientX,y:e.clientY}) })
    return ()=>{ cancelAnimationFrame(raf.current); window.removeEventListener("resize",resize) }
  },[])

  const slider=(label:string,value:number,set:(v:number)=>void,min:number,max:number,step:number)=>(
    <label key={label} className="flex flex-col gap-1.5">
      <span className="flex justify-between"><span>{label}</span><span className="text-white">{value.toFixed(2)}x</span></span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>set(Number(e.target.value))} className="w-full accent-[#3ECF8E]" />
    </label>
  )

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
      <PatternPanel p={p} anim="speed">
        <div className="text-white/40 mt-1">Liquid</div>
        {slider("Text size",textSize,setTextSize,0.7,2.2,0.05)}
        {slider("Stir",stir,setStir,0,3,0.05)}
        {slider("Swirl",swirl,setSwirl,0,3,0.05)}
        {slider("Dye",dyeAmt,setDyeAmt,0.3,3,0.05)}
      </PatternPanel>
    </>
  )
}
