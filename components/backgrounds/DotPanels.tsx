"use client"

import { useEffect, useRef } from "react"
import { usePattern, PatternPanel, hexToRgb } from "@/components/PatternControls"

interface Panel { x:number;y:number;w:number;h:number;pitch:number;dotR:number;color:number;solid:boolean;level:number }
interface Ripple { x:number;y:number;radius:number;life:number }
interface Blob { x:number;y:number;vx:number;vy:number;angle:number;angleSpeed:number;radiusX:number;radiusY:number }

// Perforated-panel mosaic: the screen is split into rectangular zones,
// each with its own dot pitch and dot size — like patched perforated
// metal sheets. Panels light up as one unit when the field crosses them;
// a rare panel is solid.
const QL = 32

function ramp(dimHex:string,colorHex:string):string[]{
  const dim=hexToRgb(dimHex), c=hexToRgb(colorHex)
  return Array.from({length:QL+1},(_,q)=>{
    const t=q/QL
    return `rgb(${Math.round(dim[0]+(c[0]-dim[0])*t)},${Math.round(dim[1]+(c[1]-dim[1])*t)},${Math.round(dim[2]+(c[2]-dim[2])*t)})`
  })
}

export default function DotPanels() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:-9999,y:-9999})
  const panelsR = useRef<Panel[]>([])
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

    // Dot sprites per (radius, fill) — arcs per dot per frame are too slow
    const cache = new Map<string,HTMLCanvasElement>()
    const dot = (r:number, fill:string)=>{
      const key=r.toFixed(1)+"|"+fill
      let c=cache.get(key)
      if(!c){
        if(cache.size>20000) cache.clear()
        const dpr=window.devicePixelRatio||1
        const s=Math.ceil(r*2)+2
        c=document.createElement("canvas")
        c.width=s*dpr; c.height=s*dpr
        const g=c.getContext("2d")!
        g.scale(dpr,dpr)
        g.fillStyle=fill
        g.beginPath(); g.arc(s/2,s/2,r,0,Math.PI*2); g.fill()
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

      let seed=987654321
      const rand=()=>{ seed=(Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296 }
      const PITCHES=[9,13,19]
      const panels:Panel[]=[]
      let y=0
      while(y<H){
        const bh=Math.min(Math.round(H*(0.16+rand()*0.22)), H-y)
        let x=0
        while(x<W){
          const pw=Math.min(Math.round(W*(0.14+rand()*0.26)), W-x)
          const pitch=PITCHES[Math.floor(rand()*PITCHES.length)]
          panels.push({
            x,y,w:pw,h:bh,pitch,
            dotR:pitch*0.14+rand()*1.1,
            color:Math.floor(rand()*4),
            solid:rand()<0.04,
            level:0,
          })
          x+=pw
        }
        y+=bh
      }
      panelsR.current=panels
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

      const {speed,steps}=p.ctl.current
      const sd=delta*speed
      timeR.current+=dt*speed
      for(const b of blobsR.current){
        b.x+=b.vx*sd;b.y+=b.vy*sd;b.angle+=b.angleSpeed*sd
        if(b.x<0||b.x>W)b.vx*=-1; if(b.y<0||b.y>H)b.vy*=-1
      }
      ripplesR.current=ripplesR.current.filter(r=>r.life<1)
      for(const r of ripplesR.current){r.radius+=10*sd;r.life+=0.04*sd}

      const {bg,fills}=fillsR.current
      const nf=fills.length
      ctx.fillStyle=bg; ctx.fillRect(0,0,W,H)

      const mx=mouse.current.x,my=mouse.current.y

      for(const pn of panelsR.current){
        const cx=pn.x+pn.w/2, cy=pn.y+pn.h/2
        let inf=0
        for(const b of blobsR.current){
          const dx=cx-b.x,dy=cy-b.y
          const cos=Math.cos(b.angle),sin=Math.sin(b.angle)
          const lx=dx*cos+dy*sin,ly=-dx*sin+dy*cos
          inf+=Math.max(0,1-Math.sqrt((lx/b.radiusX)**2+(ly/b.radiusY)**2))**2
        }
        inf=Math.min(1,inf)
        const cd=Math.sqrt((cx-mx)**2+(cy-my)**2)
        inf=Math.min(1,inf+Math.max(0,1-cd/220)**2*0.7)
        for(const r of ripplesR.current){
          const rd=Math.sqrt((cx-r.x)**2+(cy-r.y)**2)
          const df=Math.abs(rd-r.radius)
          if(df<60)inf=Math.min(1,inf+(1-df/60)*(1-r.life)*0.9)
        }

        // Panels switch as one unit, quantized — blocky by design
        const target=Math.max(0,Math.min(1,(inf-0.25)/0.15+0.5))
        pn.level=Math.round(target*(steps-1))/(steps-1)

        // Dim panels stay faintly visible; lit panels climb the ramp
        const q=Math.round((0.18+0.82*pn.level)*QL)
        const fill=fills[pn.color%nf][q]

        if(pn.solid){
          ctx.fillStyle=fill
          ctx.fillRect(pn.x+2,pn.y+2,pn.w-4,pn.h-4)
          continue
        }

        const spr=dot(pn.dotR,fill)
        const dpr=window.devicePixelRatio||1
        const sw=spr.width/dpr, sh=spr.height/dpr
        for(let yy=pn.y+pn.pitch/2; yy<pn.y+pn.h-2; yy+=pn.pitch){
          for(let xx=pn.x+pn.pitch/2; xx<pn.x+pn.w-2; xx+=pn.pitch){
            ctx.drawImage(spr,xx-sw/2,yy-sh/2,sw,sh)
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

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
      <PatternPanel p={p} anim="speed" />
    </>
  )
}
