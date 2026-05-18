"use client"

import { useEffect, useRef } from "react"

interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }

// Row-bias dither: threshold varies more strongly by row creating a horizontal stripe feel
const WORDS = ["CONF","TALK","OPEN","CODE","SHIP","LIVE","DEMO","BUILD","NEXT","DATA"]
function wordAt(col:number,row:number){ const h=((col*2654435761)^(row*2246822519))>>>0; return WORDS[h%WORDS.length] }

// Each row cycles through this palette
const ROW_COLORS = [
  "#3ECF8E", // supabase green
  "#2563eb", // blue
  "#dc2626", // red
  "#d97706", // amber
  "#7c3aed", // violet
  "#0891b2", // cyan
  "#be185d", // pink
  "#65a30d", // lime
]

export default function DitherRowsColor() {
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
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      for(const b of blobsR.current){
        b.x+=b.vx*delta;b.y+=b.vy*delta;b.angle+=b.angleSpeed*delta
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*delta;r.life+=0.04*delta}

      ctx.fillStyle="#f8f8f8"; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y
      const COLS=Math.ceil(W/STEP)+1,ROWS=Math.ceil(H/STEP)+1

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

          // Row-biased dither: odd rows have higher threshold = appear in horizontal stripes
          const rowBias = (row % 2 === 0) ? 0.0 : 0.22
          const inside = inf > 0.30 + rowBias

          if(inside){
            const rowColor = ROW_COLORS[row % ROW_COLORS.length]
            ctx.fillStyle = rowColor
            ctx.fillRect(cx-STEP/2,cy-STEP/2,STEP,STEP)
            ctx.fillStyle="#ffffff"
            ctx.font="bold 8px monospace"
            ctx.textAlign="center"; ctx.textBaseline="middle"
            ctx.fillText(wordAt(col,row),cx,cy)
          } else {
            const rowColor = ROW_COLORS[row % ROW_COLORS.length]
            ctx.fillStyle = rowColor
            ctx.beginPath(); ctx.arc(cx,cy,2,0,Math.PI*2); ctx.fill()
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
