"use client"

import { useEffect, useRef } from "react"

interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }

// Green-anchored grain landscape. One continuous brightness field flows
// across three broad hue zones cut by a slowly rotating, blob-warped
// diagonal — earth (green's red-orange complement) sweeps one side,
// green holds the middle, dusty blue/pink edges the other. All ramps
// share charcoal/cream neutrals so the zones read as one composition.
const GREEN: [number,number,number][] = [
  [40,42,38],    // charcoal
  [27,61,42],    // deep forest
  [42,110,75],   // emerald
  [62,207,142],  // supabase green
  [124,228,178], // light green
  [240,238,220], // cream
]
const EARTH: [number,number,number][] = [
  [40,42,38],
  [92,62,44],    // umber
  [188,101,68],  // terracotta
  [214,164,62],  // mustard
  [217,185,140], // tan
  [240,238,220],
]
const BLUSH: [number,number,number][] = [
  [40,42,38],
  [62,80,110],   // slate blue
  [124,147,184], // dusty blue
  [170,189,212], // pale blue
  [226,170,178], // dusty pink
  [240,238,220],
]

// Deterministic per-pixel noise in [0,1) — stable across frames
function hash(x:number,y:number,seed:number){
  let n=Math.imul(x,1597334677)^Math.imul(y,3812015801)^Math.imul(seed,2654435761)
  n=Math.imul(n^(n>>>15),2246822519)
  n=Math.imul(n^(n>>>13),3266489917)
  return ((n^(n>>>16))>>>0)/4294967296
}

export default function DitherGrainGreen() {
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
    let vF = new Float32Array(0), zF = new Float32Array(0)
    let fw = 0, fh = 0, lowW = 0, lowH = 0
    let blobsV: Blob[] = [], blobsW: Blob[] = []

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
      vF=new Float32Array(fw*fh); zF=new Float32Array(fw*fh)
      // Elongated diagonal ridges, not round spots — light sweeps in bands
      blobsV=[
        {x:W*.30,y:H*.25,vx:.20,vy:.12,angle:-.55,angleSpeed: .0006,radiusX:W*1.15,radiusY:H*.42},
        {x:W*.70,y:H*.45,vx:-.16,vy:.18,angle:-.62,angleSpeed:-.0005,radiusX:W*1.00,radiusY:H*.36},
        {x:W*.45,y:H*.75,vx:.14,vy:-.20,angle:-.50,angleSpeed: .0007,radiusX:W*1.05,radiusY:H*.38},
        {x:W*.15,y:H*.55,vx:-.18,vy:-.12,angle:-.70,angleSpeed:-.0006,radiusX:W*.90, radiusY:H*.40},
      ]
      // Warp blobs bend the diagonal zone boundary into flowing curves
      blobsW=[
        {x:W*.70,y:H*.60,vx:.14,vy:-.11,angle:0.9, angleSpeed: .002,radiusX:W*.55,radiusY:H*.50},
        {x:W*.25,y:H*.35,vx:-.17,vy:.13,angle:2.3,angleSpeed:-.003,radiusX:W*.50,radiusY:H*.48},
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

      for(const b of [...blobsV,...blobsW]){
        b.x+=b.vx*delta;b.y+=b.vy*delta;b.angle+=b.angleSpeed*delta
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*delta;r.life+=0.04*delta}

      const mx=mouse.current.x,my=mouse.current.y

      // Zone axis rotates very slowly so the bands drift over minutes
      const A=0.65+Math.sin(now*0.000015)*0.25
      const cosA=Math.cos(A),sinA=Math.sin(A)
      const norm=W*Math.abs(cosA)+H*Math.abs(sinA)

      // Coarse field pass — cheap samples, bilinear-interpolated per pixel below
      for(let j=0;j<fh;j++){
        const cy=j*CS
        for(let i=0;i<fw;i++){
          const cx=i*CS
          // Gentle compression — broad mid-tone fields, cream still a rare peak
          let v=Math.min(1,fieldAt(blobsV,cx,cy)*0.9)**1.1
          const cd=Math.sqrt((cx-mx)**2+(cy-my)**2)
          v=Math.min(1,v+Math.max(0,1-cd/200)**2*0.5)
          for(const r of ripplesR.current){
            const rd=Math.sqrt((cx-r.x)**2+(cy-r.y)**2)
            const df=Math.abs(rd-r.radius)
            if(df<30)v=Math.min(1,v+(1-df/30)*(1-r.life)*0.8)
          }
          vF[j*fw+i]=v
          // Diagonal position warped by drifting blobs = flowing zone boundary
          zF[j*fw+i]=(cx*cosA+cy*sinA)/norm+(fieldAt(blobsW,cx,cy)-0.35)*0.30
        }
      }

      // Grain pass — stochastic dither with a frame-stable hash noise pattern
      const d=img.data
      const top=GREEN.length-1
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
          const z00=zF[r0+i0],z10=zF[r0+i0+1],z01=zF[r1+i0],z11=zF[r1+i0+1]
          const z=(z00+(z10-z00)*tx)*(1-ty)+(z01+(z11-z01)*tx)*ty

          v+=(hash(x,y,1)-0.5)*0.12
          if(v<0)v=0; else if(v>1)v=1
          const t=v*top
          let i=t|0; if(i>top-1)i=top-1
          const idx=i+(hash(x,y,2)<t-i?1:0)
          // Zone bands with grainy edges: earth low side, blush high side
          const zj=z+(hash(x,y,3)-0.5)*0.14
          const ramp = zj<0.28 ? EARTH : zj>0.74 ? BLUSH : GREEN
          const c=ramp[idx]
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
