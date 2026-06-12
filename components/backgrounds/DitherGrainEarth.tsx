"use client"

import { useEffect, useRef } from "react"

interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }

// Earth-tone grain gradients. Color theory: analogous warm ramp (umber,
// terracotta, mustard, tan) with a complementary cool accent ramp (slate,
// dusty blue, dusty pink), both anchored by the same charcoal/cream neutrals.
// Grain is hashed from pixel coords — static texture, moving fields beneath.
const WARM: [number,number,number][] = [
  [43,40,38],    // charcoal
  [92,62,44],    // umber
  [188,101,68],  // terracotta
  [214,164,62],  // mustard
  [217,185,140], // tan
  [242,234,216], // cream
]
const COOLP: [number,number,number][] = [
  [43,40,38],
  [62,80,110],   // slate blue
  [124,147,184], // dusty blue
  [170,189,212], // pale blue
  [226,170,178], // dusty pink
  [242,234,216],
]

// Deterministic per-pixel noise in [0,1) — stable across frames
function hash(x:number,y:number,seed:number){
  let n=Math.imul(x,1597334677)^Math.imul(y,3812015801)^Math.imul(seed,2654435761)
  n=Math.imul(n^(n>>>15),2246822519)
  n=Math.imul(n^(n>>>13),3266489917)
  return ((n^(n>>>16))>>>0)/4294967296
}

export default function DitherGrainEarth() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const GRAIN = 2   // CSS px per grain cell
    const CS = 16     // coarse field sample step, CSS px
    const low = document.createElement("canvas")
    const lowCtx = low.getContext("2d")!
    let img: ImageData
    let vF = new Float32Array(0), gF = new Float32Array(0)
    let fw = 0, fh = 0, lowW = 0, lowH = 0
    let blobsV: Blob[] = [], blobsG: Blob[] = []

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
      vF=new Float32Array(fw*fh); gF=new Float32Array(fw*fh)
      blobsV=[
        {x:W*.25,y:H*.30,vx:.30,vy:.20,angle:0.4, angleSpeed: .003,radiusX:W*.60,radiusY:H*.55},
        {x:W*.75,y:H*.25,vx:-.22,vy:.26,angle:2.1,angleSpeed:-.002,radiusX:W*.52,radiusY:H*.48},
        {x:W*.55,y:H*.65,vx:.18,vy:-.30,angle:1.0,angleSpeed: .004,radiusX:W*.48,radiusY:H*.44},
        {x:W*.10,y:H*.80,vx:-.26,vy:-.18,angle:2.8,angleSpeed:-.003,radiusX:W*.44,radiusY:H*.48},
      ]
      blobsG=[
        {x:W*.70,y:H*.75,vx:.16,vy:-.12,angle:0.9, angleSpeed: .002,radiusX:W*.50,radiusY:H*.42},
        {x:W*.15,y:H*.20,vx:-.20,vy:.14,angle:2.3,angleSpeed:-.003,radiusX:W*.45,radiusY:H*.45},
      ]
    }

    const fieldAt=(blobs:Blob[],cx:number,cy:number)=>{
      let inf=0
      for(const b of blobs){
        const dx=cx-b.x,dy=cy-b.y
        const cos=Math.cos(b.angle),sin=Math.sin(b.angle)
        const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos
        inf+=Math.max(0,1-Math.sqrt((lx/b.radiusX)**2+(ly/b.radiusY)**2))**2
      }
      return Math.min(1,inf)
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      for(const b of [...blobsV,...blobsG]){
        b.x+=b.vx*delta;b.y+=b.vy*delta;b.angle+=b.angleSpeed*delta
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*delta;r.life+=0.04*delta}

      const mx=mouse.current.x,my=mouse.current.y

      // Coarse field pass — cheap samples, bilinear-interpolated per pixel below
      for(let j=0;j<fh;j++){
        const cy=j*CS
        for(let i=0;i<fw;i++){
          const cx=i*CS
          // Compress + gamma so cream stays a rare peak, mid earth tones dominate
          let v=Math.min(1,fieldAt(blobsV,cx,cy)*0.8)**1.3
          const cd=Math.sqrt((cx-mx)**2+(cy-my)**2)
          v=Math.min(1,v+Math.max(0,1-cd/200)**2*0.5)
          for(const r of ripplesR.current){
            const rd=Math.sqrt((cx-r.x)**2+(cy-r.y)**2)
            const df=Math.abs(rd-r.radius)
            if(df<30)v=Math.min(1,v+(1-df/30)*(1-r.life)*0.8)
          }
          vF[j*fw+i]=v
          gF[j*fw+i]=fieldAt(blobsG,cx,cy)
        }
      }

      // Grain pass — stochastic dither with a frame-stable hash noise pattern
      const d=img.data
      const top=WARM.length-1
      let p=0
      for(let y=0;y<lowH;y++){
        const gy=(y*GRAIN)/CS
        const j0=Math.min(fh-2,gy|0), ty=gy-j0
        const r0=j0*fw, r1=(j0+1)*fw
        for(let x=0;x<lowW;x++){
          const gx=(x*GRAIN)/CS
          const i0=Math.min(fw-2,gx|0), tx=gx-i0
          const v00=vF[r0+i0],v10=vF[r0+i0+1],v01=vF[r1+i0],v11=vF[r1+i0+1]
          let v=(v00+(v10-v00)*tx)*(1-ty)+(v01+(v11-v01)*tx)*ty
          const g00=gF[r0+i0],g10=gF[r0+i0+1],g01=gF[r1+i0],g11=gF[r1+i0+1]
          // Sharpen the ramp mix so the cool accent reads as a region, ~30% share
          let g=(g00+(g10-g00)*tx)*(1-ty)+(g01+(g11-g01)*tx)*ty
          g=(g-0.40)/0.25
          if(g<0)g=0; else if(g>1)g=1

          v+=(hash(x,y,1)-0.5)*0.12
          if(v<0)v=0; else if(v>1)v=1
          const t=v*top
          let i=t|0; if(i>top-1)i=top-1
          const idx=i+(hash(x,y,2)<t-i?1:0)
          const c=(hash(x,y,3)<g?COOLP:WARM)[idx]
          d[p]=c[0]; d[p+1]=c[1]; d[p+2]=c[2]; d[p+3]=255
          p+=4
        }
      }
      lowCtx.putImageData(img,0,0)
      ctx.imageSmoothingEnabled=false
      ctx.drawImage(low,0,0,W,H)
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
