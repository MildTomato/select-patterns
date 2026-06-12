"use client"

import { useEffect, useRef } from "react"
import { usePattern, PatternPanel, hexToRgb } from "@/components/PatternControls"

// 3D starburst: an invisible point in space with equal-length lines
// radiating to round pills that always face the camera (billboards).
// The camera orbits the center slowly; mouse adds a little parallax.
const N = 20          // number of spokes
const CAM_DIST = 2.6  // camera distance from center (sphere radius = 1)
const FOCAL = 1.9

export default function OrbitPoints() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mouse = useRef({x:0,y:0})       // parallax target, -1..1
  const par = useRef({x:0,y:0})         // smoothed parallax
  const raf = useRef(0)
  const last = useRef(0)
  const timeR = useRef(0)
  const p = usePattern()

  useEffect(()=>{
    const canvas = canvasRef.current!
    const ctx = canvas.getContext("2d")!

    // Evenly distributed directions — Fibonacci sphere, all at radius 1
    const pts:[number,number,number][]=[]
    for(let i=0;i<N;i++){
      const y=1-(i+0.5)*2/N
      const r=Math.sqrt(1-y*y)
      const phi=i*2.399963229728653
      pts.push([Math.cos(phi)*r, y, Math.sin(phi)*r])
    }

    const resize = ()=>{
      const dpr = window.devicePixelRatio||1
      const W = window.innerWidth, H = window.innerHeight
      canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr)
      canvas.style.width=W+"px"; canvas.style.height=H+"px"
      ctx.setTransform(dpr,0,0,dpr,0,0)
    }

    const frame=(now:number)=>{
      raf.current=requestAnimationFrame(frame)
      const dt=now-(last.current||now-16); last.current=now
      const delta=Math.min(dt/16.667,4)
      const W=window.innerWidth,H=window.innerHeight

      const pal=p.palR.current
      timeR.current+=dt*p.ctl.current.speed
      const t=timeR.current

      // Smooth the mouse parallax
      const k=Math.min(1,0.06*delta)
      par.current.x+=(mouse.current.x-par.current.x)*k
      par.current.y+=(mouse.current.y-par.current.y)*k

      // Camera orbit: steady yaw, gentle pitch sway, mouse offsets
      const yaw=t*0.00022 + par.current.x*0.45
      const pitch=Math.sin(t*0.00008)*0.35 + par.current.y*0.35
      const cyaw=Math.cos(yaw),syaw=Math.sin(yaw)
      const cpit=Math.cos(pitch),spit=Math.sin(pitch)

      const S=Math.min(W,H)*0.52
      const cx=W/2, cy=H/2

      const proj=pts.map(([x,y,z])=>{
        const x1=x*cyaw+z*syaw, z1=-x*syaw+z*cyaw
        const y2=y*cpit-z1*spit, z2=y*spit+z1*cpit
        const s=FOCAL/(z2+CAM_DIST)
        return {sx:cx+x1*s*S, sy:cy+y2*s*S, s, z:z2}
      })
      proj.sort((a,b)=>b.z-a.z) // far → near

      ctx.fillStyle=pal.bg; ctx.fillRect(0,0,W,H)

      // Spokes from the invisible center — dash color pulled toward
      // mid-gray so the lines stay visible on any background
      const d=hexToRgb(pal.dim)
      ctx.strokeStyle=`rgb(${Math.round(d[0]*0.45+128*0.55)},${Math.round(d[1]*0.45+128*0.55)},${Math.round(d[2]*0.45+128*0.55)})`
      ctx.lineWidth=1
      for(const q of proj){
        ctx.beginPath()
        ctx.moveTo(cx,cy)
        ctx.lineTo(q.sx,q.sy)
        ctx.stroke()
      }

      // Billboard pills — drawn in screen space, so always camera-facing,
      // scaled by perspective depth
      for(const q of proj){
        const w=46*q.s, h=16*q.s
        ctx.fillStyle=pal.rows[0]
        ctx.beginPath()
        ctx.roundRect(q.sx-w/2,q.sy-h/2,w,h,h/2)
        ctx.fill()
      }
    }

    resize(); raf.current=requestAnimationFrame(frame)
    window.addEventListener("resize",resize)
    canvas.addEventListener("mousemove",e=>{
      mouse.current={x:(e.clientX/window.innerWidth-0.5)*2, y:(e.clientY/window.innerHeight-0.5)*2}
    })
    canvas.addEventListener("mouseleave",()=>{ mouse.current={x:0,y:0} })
    return ()=>{ cancelAnimationFrame(raf.current); window.removeEventListener("resize",resize) }
  },[])

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 cursor-crosshair" />
      <PatternPanel p={p} anim="speed" />
    </>
  )
}
