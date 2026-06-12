"use client"

import { useEffect, useRef } from "react"
import { usePattern, PatternPanel } from "@/components/PatternControls"

interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }
interface Ripple { x:number;y:number;radius:number;life:number }

// Rows-color-light, cut up: the canvas is sliced into vertical panels,
// each clipped hard and shifted vertically, so the continuous dither
// field breaks at every seam — like a ribbon sliced into offset panes.
const WORDS = ["CONF","TALK","OPEN","CODE","SHIP","LIVE","DEMO","BUILD","NEXT","DATA"]
function wordAt(col:number,row:number){ const h=((col*2654435761)^(row*2246822519))>>>0; return WORDS[h%WORDS.length] }

// Panel widths (fractions, sum 1) and base vertical offsets (fractions of H)
const SLICE_W   = [ .16, .10, .14, .12, .18, .13, .17]
const SLICE_OFF = [-.10, .07,-.04, .12,-.08, .05,-.12]

export default function DitherRowsCut() {
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

      const pal=p.palR.current
      const sd=delta*p.ctl.current.speed
      for(const b of blobsR.current){
        b.x+=b.vx*sd;b.y+=b.vy*sd;b.angle+=b.angleSpeed*sd
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*sd;r.life+=0.04*sd}

      ctx.fillStyle=pal.bg; ctx.fillRect(0,0,W,H)

      let x0=0
      for(let s=0;s<SLICE_W.length;s++){
        const w = s===SLICE_W.length-1 ? W-x0 : SLICE_W[s]*W
        // Each panel floats gently around its base offset, out of phase
        const yOff = SLICE_OFF[s]*H + Math.sin(now*0.0004 + s*1.7)*H*0.015

        ctx.save()
        ctx.beginPath(); ctx.rect(x0,0,w,H); ctx.clip()
        ctx.translate(0,yOff)

        // Content space is shifted by yOff; mouse/ripples live in screen space
        const mx=mouse.current.x, my=mouse.current.y-yOff
        const rowStart=Math.floor(-yOff/STEP)-1, rowEnd=Math.ceil((H-yOff)/STEP)+1
        const colStart=Math.floor(x0/STEP)-1, colEnd=Math.ceil((x0+w)/STEP)+1

        for(let row=rowStart;row<=rowEnd;row++){
          for(let col=colStart;col<=colEnd;col++){
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
              const rd=Math.sqrt((cx-r.x)**2+(cy-(r.y-yOff))**2)
              const df=Math.abs(rd-r.radius)
              if(df<22)inf=Math.min(1,inf+(1-df/22)*(1-r.life)*0.9)
            }

            const rowBias = ((row%2)+2)%2 === 0 ? 0.0 : 0.22
            const inside = inf > 0.30 + rowBias

            if(inside){
              const n=pal.rows.length
              ctx.fillStyle = pal.rows[((row%n)+n)%n]
              ctx.fillRect(cx-STEP/2,cy-STEP/2,STEP,STEP)
              ctx.fillStyle="#ffffff"
              ctx.font="bold 8px monospace"
              ctx.textAlign="center"; ctx.textBaseline="middle"
              ctx.fillText(wordAt(col,row),cx,cy)
            } else {
              ctx.fillStyle = pal.dim
              ctx.beginPath(); ctx.arc(cx,cy,2,0,Math.PI*2); ctx.fill()
            }
          }
        }
        ctx.restore()
        x0+=w
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
