"use client"

import { useEffect, useRef } from "react"
import { usePattern, PatternPanel, hexToRgb } from "@/components/PatternControls"

interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Cell { cx:number;cy:number;inf:number;color:string;word:string }

// Bloom variant of rows-color-light: gradient color ramps + soft glow layer
const WORDS = ["CONF","TALK","OPEN","CODE","SHIP","LIVE","DEMO","BUILD","NEXT","DATA"]
function wordAt(col:number,row:number){ const h=((col*2654435761)^(row*2246822519))>>>0; return WORDS[h%WORDS.length] }

// Gradient ramp built from the shared palette's colors
function ramp(stops:[number,number,number][], t:number){
  t=Math.max(0,Math.min(1,t))
  const f=t*(stops.length-1)
  const i=Math.min(stops.length-2,Math.floor(f)), u=f-i
  const a=stops[i], b=stops[i+1]
  return `rgb(${Math.round(a[0]+(b[0]-a[0])*u)},${Math.round(a[1]+(b[1]-a[1])*u)},${Math.round(a[2]+(b[2]-a[2])*u)})`
}

export default function DitherRowsBloom() {
  const p = usePattern()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const blobsR = useRef<Blob[]>([])
  const ripplesR = useRef<Ripple[]>([])
  const raf = useRef(0)
  const last = useRef(0)

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!
    const STEP = 28
    const BLOOM_SCALE = 0.1
    const bloomCanvas = document.createElement("canvas")
    const bloomCtx = bloomCanvas.getContext("2d")!

    const resize = ()=>{
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
      bloomCanvas.width=Math.max(1,Math.ceil(W*BLOOM_SCALE))
      bloomCanvas.height=Math.max(1,Math.ceil(H*BLOOM_SCALE))
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

      const pal=p.palR.current
      const stops=pal.rows.map(hexToRgb)
      const sd=delta*p.ctl.current.speed
      for(const b of blobsR.current){
        b.x+=b.vx*sd;b.y+=b.vy*sd;b.angle+=b.angleSpeed*sd
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*sd;r.life+=0.04*sd}

      const mx=mouse.current.x,my=mouse.current.y
      const COLS=Math.ceil(W/STEP)+1,ROWS=Math.ceil(H/STEP)+1

      // Pass 1: compute active cells so the bloom layer can render beneath them
      const cells: Cell[] = []
      const dots: [number,number][] = []
      for(let row=0;row<=ROWS;row++){
        for(let col=0;col<=COLS;col++){
          const cx=col*STEP,cy=row*STEP
          let inf=0
          for(const b of blobsR.current){
            const dx=cx-b.x,dy=cy-b.y
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

          const rowBias = (row % 2 === 0) ? 0.0 : 0.22
          if(inf > 0.30 + rowBias){
            // Gradient sweeps diagonally and drifts over time; intensity pushes along the ramp
            const wave = 0.5+0.5*Math.sin(cx*0.0035 + cy*0.0025 - now*0.00045)
            const t = wave*0.6 + inf*0.4
            cells.push({cx,cy,inf,color:ramp(stops,t),word:wordAt(col,row)})
          } else {
            dots.push([cx,cy])
          }
        }
      }

      ctx.fillStyle=pal.bg; ctx.fillRect(0,0,W,H)

      // Bloom layer: cells stamped onto a tiny canvas, upscaled so they smear into glow
      bloomCtx.clearRect(0,0,bloomCanvas.width,bloomCanvas.height)
      const bs = STEP*BLOOM_SCALE
      for(const c of cells){
        bloomCtx.fillStyle=c.color
        bloomCtx.globalAlpha=0.35+0.45*c.inf
        bloomCtx.fillRect(c.cx*BLOOM_SCALE-bs*1.5,c.cy*BLOOM_SCALE-bs*1.5,bs*3,bs*3)
      }
      bloomCtx.globalAlpha=1
      ctx.imageSmoothingEnabled=true
      ctx.globalAlpha=0.55
      ctx.drawImage(bloomCanvas,0,0,W,H)
      ctx.globalAlpha=1

      // Pass 2: sharp grid on top — cells bloom larger with intensity
      ctx.fillStyle=pal.dim
      for(const [dx,dy] of dots){
        ctx.beginPath(); ctx.arc(dx,dy,1.5,0,Math.PI*2); ctx.fill()
      }
      for(const c of cells){
        const size = STEP*(0.5+0.5*c.inf)
        ctx.fillStyle=c.color
        ctx.fillRect(c.cx-size/2,c.cy-size/2,size,size)
        if(c.inf>0.5){
          ctx.fillStyle="#ffffff"
          ctx.font="bold 8px monospace"
          ctx.textAlign="center"; ctx.textBaseline="middle"
          ctx.fillText(c.word,c.cx,c.cy)
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
      <PatternPanel p={p} anim="speed" />
    </>
  )
}
