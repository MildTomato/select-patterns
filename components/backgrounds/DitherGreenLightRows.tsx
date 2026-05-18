"use client"

import { useEffect, useRef } from "react"

interface Blob { x:number;y:number;vy:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }

const BAYER = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]
const WORDS = ["CONF","TALK","OPEN","CODE","SHIP","LIVE","DEMO","BUILD","NEXT","DATA"]
function wordAt(col:number,row:number){ const h=((col*2654435761)^(row*2246822519))>>>0; return WORDS[h%WORDS.length] }

const TILE_COLORS = ["#0d9e6a","#1a4731","#276749","#3ECF8E","#a8f0d4"]
function tileColor(inf: number): string {
  if (inf > 0.75) return TILE_COLORS[1]
  if (inf > 0.55) return TILE_COLORS[2]
  if (inf > 0.40) return TILE_COLORS[3]
  if (inf > 0.28) return TILE_COLORS[4]
  return TILE_COLORS[4]
}

const DOT_COLORS = ["#d8d4ce","#b8d4c8","#8ec8b0","#5db896","#3ECF8E"]
function dotColor(inf: number): string {
  if (inf > 0.25) return DOT_COLORS[4]
  if (inf > 0.16) return DOT_COLORS[3]
  if (inf > 0.10) return DOT_COLORS[2]
  if (inf > 0.05) return DOT_COLORS[1]
  return DOT_COLORS[0]
}

export default function DitherGreenLightRows() {
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
      // Horizontal band blobs — full width, narrow height, move vertically only
      blobsR.current=[
        {x:W*0.5, y:H*0.20, vy: 0.40, radiusY:H*0.14},
        {x:W*0.5, y:H*0.50, vy:-0.28, radiusY:H*0.18},
        {x:W*0.5, y:H*0.75, vy: 0.22, radiusY:H*0.12},
        {x:W*0.5, y:H*0.38, vy:-0.35, radiusY:H*0.10},
        {x:W*0.5, y:H*0.88, vy: 0.18, radiusY:H*0.16},
      ]
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      // Blobs drift vertically and bounce off top/bottom
      for(const b of blobsR.current){
        b.y+=b.vy*delta
        if(b.y<0||b.y>H) b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*delta;r.life+=0.04*delta}

      ctx.fillStyle="#f5f0eb"; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y
      const COLS=Math.ceil(W/STEP)+1,ROWS=Math.ceil(H/STEP)+1

      for(let row=0;row<=ROWS;row++){
        for(let col=0;col<=COLS;col++){
          const cx=col*STEP,cy=row*STEP
          let inf=0

          // Each blob is a full-width horizontal band — only Y distance matters
          for(const b of blobsR.current){
            const dy=cy-b.y
            const band=Math.max(0,1-Math.abs(dy)/b.radiusY)
            inf+=band*band
          }
          inf=Math.min(1,inf)

          // Cursor adds a radial boost (horizontal emphasis: wider X radius)
          const cdx=(cx-mx)/2.5 // squash horizontal distance so effect spreads wider
          const cdy=cy-my
          const cd=Math.sqrt(cdx*cdx+cdy*cdy)
          inf=Math.min(1,inf+Math.max(0,1-cd/180)**2*0.7)

          for(const r of ripplesR.current){
            const rd=Math.sqrt((cx-r.x)**2+(cy-r.y)**2)
            const df=Math.abs(rd-r.radius)
            if(df<22)inf=Math.min(1,inf+(1-df/22)*(1-r.life)*0.9)
          }

          // Row-biased dither: odd rows have a raised threshold, emphasising horizontal stripes
          const bayer=BAYER[row%4][col%4]/16
          const rowBias = (row%2===0) ? 0 : 0.12
          const inside=inf>0.28+rowBias+(bayer-0.5)*0.22

          if(inside){
            ctx.fillStyle=tileColor(inf)
            ctx.fillRect(cx-STEP/2,cy-STEP/2,STEP,STEP)
            ctx.fillStyle="#0a1a10"
            ctx.font="bold 8px monospace"
            ctx.textAlign="center"; ctx.textBaseline="middle"
            ctx.fillText(wordAt(col,row),cx,cy)
          } else {
            const dotR = 1 + inf * 3
            ctx.fillStyle = dotColor(inf)
            ctx.beginPath(); ctx.arc(cx,cy,dotR,0,Math.PI*2); ctx.fill()
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
