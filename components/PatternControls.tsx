"use client"

import { useEffect, useRef, useState } from "react"

// Shared pattern controls: one palette + animation-settings store used by
// the pill and dither pages. Palettes are kept per theme (light/dark),
// saved palettes are global, everything persists to localStorage.
export interface Palette { bg:string; dim:string; rows:string[] }
export type Mode = "tween"|"step"|"slide"

export const PALETTE_DARK: Palette = {
  bg:  "#0b110e",
  dim: "#1b2a21",
  rows:["#7bf1a8","#2a7b54","#ddffb3","#f0fafd"],
}
export const PALETTE_LIGHT: Palette = {
  bg:  "#f6f0ec",
  dim: "#e6e6e6",
  rows:["#37cd71","#296a4b","#ffc9b3","#c7cbff"],
}

// Baked-in presets — recovered saved palettes, so they survive any
// localStorage/origin change. Used to seed the saved list when empty.
export const PRESETS: {name:string;pal:Palette}[] = [
  {name:"P1 · 10:17", pal:{bg:"#0b110e",dim:"#1b2a21",rows:["#7bf1a8","#2a7b54","#ddffb3","#f0fafd"]}},
  {name:"P2 · 10:27", pal:{bg:"#ffffff",dim:"#f2f2f2",rows:["#7bf1a8","#2a7b54","#e1ffbd","#f0fafd"]}},
  {name:"P3 · 10:29", pal:{bg:"#f6f0ec",dim:"#e6e6e6",rows:["#37cd71","#296a4b","#584428","#c4c4c4"]}},
  {name:"P4 · 10:30", pal:{bg:"#f6f0ec",dim:"#e6e6e6",rows:["#37cd71","#296a4b","#ffbfa3","#ddc2ff"]}},
  {name:"P5 · 10:33", pal:{bg:"#f6f0ec",dim:"#e6e6e6",rows:["#37cd71","#296a4b","#ffc9b3","#c7cbff"]}},
  {name:"P6 · 10:44", pal:{bg:"#f6f0ec",dim:"#e6e6e6",rows:["#37cd71","#296a4b","#ffc8b3","#c8ccea"]}},
  {name:"P7 · 10:47", pal:{bg:"#0d0d0d",dim:"#242424",rows:["#37cd71","#296a4b","#ffc8b3","#c8ccea"]}},
  {name:"P8 · 10:50", pal:{bg:"#f6f0ec",dim:"#e6e6e6",rows:["#1fd665","#28714e","#f9c5a9","#c8ccea"]}},
  {name:"P9 · 12:21", pal:{bg:"#000000",dim:"#212121",rows:["#1fd665","#28714e","#f7c2a6","#bece92"]}},
  {name:"P10 · 12:25",pal:{bg:"#121212",dim:"#1d201e",rows:["#39db77","#28714e","#fbc5a7","#d1e7ff"]}},
  {name:"P11 · 12:27",pal:{bg:"#121212",dim:"#1d201e",rows:["#39db77","#28714e","#fbd8c6","#d1e7ff"]}},
]

const SAVED_KEY = "select-saved-palettes"
const CUR_KEY   = "select-current-palettes"
const ANIM_KEY  = "select-anim"
// Earlier neon-page keys, migrated on first load
const LEGACY_SAVED = "pill-neon-palettes"
const LEGACY_CUR   = "pill-neon-current"
const LEGACY_ANIM  = "pill-neon-anim"

// Page-local control state that survives reloads (per-key localStorage)
export function usePersisted<T>(key:string, initial:T):[T,(v:T)=>void]{
  const [v,setV]=useState<T>(initial)
  useEffect(()=>{
    try{ const s=localStorage.getItem(key); if(s!=null) setV(JSON.parse(s)) }catch{}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])
  const set=(nv:T)=>{
    setV(nv)
    try{ localStorage.setItem(key,JSON.stringify(nv)) }catch{}
  }
  return [v,set]
}

export function hexToRgb(hex:string):[number,number,number]{
  const n=parseInt(hex.slice(1),16)
  return [(n>>16)&255,(n>>8)&255,n&255]
}

export function usePattern(){
  const [theme, setTheme] = useState<"dark"|"light">("dark")
  const [palettes, setPalettes] = useState({dark:PALETTE_DARK, light:PALETTE_LIGHT})
  const [saved, setSaved] = useState<{name:string;pal:Palette}[]>(PRESETS)
  const [copied, setCopied] = useState<"idle"|"ok"|"fail">("idle")
  const [showJson, setShowJson] = useState<string|null>(null)

  const [mode, setMode] = useState<Mode>("step")
  const [speed, setSpeed] = useState(1)
  const [rowVar, setRowVar] = useState(0.8)
  const [ease, setEase] = useState(1)
  const [steps, setSteps] = useState(4)

  const pal = palettes[theme]
  const palR = useRef(pal); palR.current = pal
  const ctl = useRef({mode,speed,rowVar,ease,steps})
  ctl.current = {mode,speed,rowVar,ease,steps}

  // Restore persisted state (with legacy-key migration), track theme toggle
  useEffect(()=>{
    try{
      const s=localStorage.getItem(SAVED_KEY)??localStorage.getItem(LEGACY_SAVED)
      // Baked-in presets stay when storage is empty on this origin
      if(s && JSON.parse(s).length>0) setSaved(JSON.parse(s))
    }catch{}
    try{
      const c=localStorage.getItem(CUR_KEY)??localStorage.getItem(LEGACY_CUR)
      if(c){ const v=JSON.parse(c); if(v.dark&&v.light) setPalettes(v) }
    }catch{}
    try{
      const a=localStorage.getItem(ANIM_KEY)??localStorage.getItem(LEGACY_ANIM)
      if(a){
        const v=JSON.parse(a)
        if(v.mode==="tween"||v.mode==="step"||v.mode==="slide") setMode(v.mode)
        if(typeof v.speed==="number") setSpeed(v.speed)
        if(typeof v.rowVar==="number") setRowVar(v.rowVar)
        if(typeof v.ease==="number") setEase(v.ease)
        if(typeof v.steps==="number") setSteps(v.steps)
      }
    }catch{}
    const el=document.documentElement
    const update=()=>setTheme(el.classList.contains("dark")?"dark":"light")
    update()
    const mo=new MutationObserver(update)
    mo.observe(el,{attributes:true,attributeFilter:["class"]})
    return ()=>mo.disconnect()
  },[])

  useEffect(()=>{
    localStorage.setItem(ANIM_KEY, JSON.stringify({mode,speed,rowVar,ease,steps}))
  },[mode,speed,rowVar,ease,steps])

  const setPal = (p:Palette)=>{
    const next={...palettes,[theme]:p}
    setPalettes(next)
    localStorage.setItem(CUR_KEY,JSON.stringify(next))
  }
  const resetPalette = ()=>setPal(theme==="dark"?PALETTE_DARK:PALETTE_LIGHT)
  const savePalette = ()=>{
    const name=`P${saved.length+1} · ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`
    const next=[...saved,{name,pal}]
    setSaved(next)
    localStorage.setItem(SAVED_KEY,JSON.stringify(next))
  }
  const deletePalette = (i:number)=>{
    const next=saved.filter((_,j)=>j!==i)
    setSaved(next)
    localStorage.setItem(SAVED_KEY,JSON.stringify(next))
  }
  const copyPalette = async ()=>{
    const text=JSON.stringify(pal,null,2)
    let ok=false
    try{
      await navigator.clipboard.writeText(text)
      ok=true
    }catch{
      const ta=document.createElement("textarea")
      ta.value=text
      ta.style.position="fixed"; ta.style.opacity="0"
      document.body.appendChild(ta)
      ta.select()
      try{ ok=document.execCommand("copy") }catch{}
      ta.remove()
    }
    setCopied(ok?"ok":"fail")
    if(!ok) setShowJson(text)
    setTimeout(()=>setCopied("idle"),1500)
  }

  return {
    theme, pal, palR, ctl, setPal, resetPalette,
    saved, savePalette, deletePalette, copyPalette, copied, showJson, setShowJson,
    mode, setMode, speed, setSpeed, rowVar, setRowVar, ease, setEase, steps, setSteps,
  }
}
export type Pattern = ReturnType<typeof usePattern>

export function PatternPanel({p, anim="full", children}:{p:Pattern; anim?:"full"|"speed"; children?:React.ReactNode}){
  const accent = "accent-[#3ECF8E]"
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [pasteErr, setPasteErr] = useState(false)

  const applyPaste = ()=>{
    try{
      const v=JSON.parse(pasteText)
      const hex=(s:unknown)=>typeof s==="string"&&/^#[0-9a-fA-F]{6}$/.test(s)
      if(!hex(v.bg)||!hex(v.dim)||!Array.isArray(v.rows)||v.rows.length<1||!v.rows.every(hex)) throw new Error()
      p.setPal({bg:v.bg,dim:v.dim,rows:v.rows})
      setPasteOpen(false); setPasteText(""); setPasteErr(false)
    }catch{ setPasteErr(true) }
  }
  const openPaste = async ()=>{
    setPasteOpen(true); setPasteErr(false)
    // Prefill from clipboard when the browser allows it
    try{ const t=await navigator.clipboard.readText(); if(t?.trim().startsWith("{")) setPasteText(t) }catch{}
  }
  const swatch = (label:string, value:string, onChange:(v:string)=>void)=>(
    <label key={label} className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-1.5">
        <span className="text-white/40 normal-case">{value}</span>
        <input type="color" value={value}
          onChange={e=>onChange(e.target.value)}
          className="w-6 h-6 bg-transparent border border-white/20 cursor-pointer p-0" />
      </span>
    </label>
  )

  return (
    <div className="absolute top-6 right-6 z-50 w-64 max-h-[calc(100vh-3rem)] overflow-y-auto font-mono text-[10px] tracking-[0.15em] uppercase bg-black/80 border border-white/20 backdrop-blur-sm p-4 flex flex-col gap-4 text-white/70 select-none">
      <div className="text-white/40">Animation</div>

      {anim==="full" && (
        <div className="flex gap-1">
          {(["tween","step","slide"] as const).map(m=>(
            <button key={m} onClick={()=>p.setMode(m)}
              className={["flex-1 px-2 py-1.5 border transition-colors",
                p.mode===m ? "bg-white text-black border-white"
                : "border-white/20 text-white/50 hover:text-white hover:border-white/60"].join(" ")}>
              {m}
            </button>
          ))}
        </div>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="flex justify-between"><span>Speed</span><span className="text-white">{p.speed.toFixed(2)}x</span></span>
        <input type="range" min={0} max={3} step={0.05} value={p.speed}
          onChange={e=>p.setSpeed(Number(e.target.value))} className={`w-full ${accent}`} />
      </label>

      {anim==="full" && (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="flex justify-between"><span>Row drift</span><span className="text-white">{p.rowVar.toFixed(2)}x</span></span>
            <input type="range" min={0} max={2.5} step={0.05} value={p.rowVar}
              onChange={e=>p.setRowVar(Number(e.target.value))} className={`w-full ${accent}`} />
          </label>

          <label className={["flex flex-col gap-1.5 transition-opacity", p.mode==="step"?"opacity-30 pointer-events-none":""].join(" ")}>
            <span className="flex justify-between"><span>Ease</span><span className="text-white">{p.ease.toFixed(2)}x</span></span>
            <input type="range" min={0.2} max={3} step={0.05} value={p.ease}
              onChange={e=>p.setEase(Number(e.target.value))} className={`w-full ${accent}`} />
          </label>

          <label className={["flex flex-col gap-1.5 transition-opacity", p.mode==="tween"?"opacity-30 pointer-events-none":""].join(" ")}>
            <span className="flex justify-between"><span>Steps</span><span className="text-white">{p.steps}</span></span>
            <input type="range" min={2} max={6} step={1} value={p.steps}
              onChange={e=>p.setSteps(Number(e.target.value))} className={`w-full ${accent}`} />
          </label>
        </>
      )}

      {children}

      <div className="text-white/40 mt-1">Colors</div>

      {swatch("Background", p.pal.bg, v=>p.setPal({...p.pal,bg:v}))}
      {swatch("Dash", p.pal.dim, v=>p.setPal({...p.pal,dim:v}))}
      {p.pal.rows.map((c,i)=>swatch(`Color ${i+1}`, c, v=>p.setPal({...p.pal,rows:p.pal.rows.map((r,j)=>j===i?v:r)})))}

      <div className="grid grid-cols-2 gap-1">
        <button onClick={p.savePalette}
          className="px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
          Save
        </button>
        <button onClick={p.copyPalette}
          className="px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
          {p.copied==="ok"?"Copied!":p.copied==="fail"?"Copy failed":"Copy JSON"}
        </button>
        <button onClick={openPaste}
          className="px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
          Paste JSON
        </button>
        <button onClick={p.resetPalette}
          className="px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
          Reset
        </button>
      </div>

      {pasteOpen && (
        <div className="flex flex-col gap-1">
          <div className={pasteErr?"text-red-400":"text-white/40"}>
            {pasteErr?"Invalid palette JSON":"Paste a palette JSON"}
          </div>
          <textarea value={pasteText} rows={7} autoFocus
            onChange={e=>{setPasteText(e.target.value); setPasteErr(false)}}
            placeholder={'{ "bg": "#0b110e", "dim": "#1b2a21", "rows": ["#7bf1a8", …] }'}
            className="w-full bg-black/60 border border-white/20 text-white/80 p-2 text-[9px] normal-case tracking-normal font-mono resize-none placeholder:text-white/20" />
          <div className="flex gap-1">
            <button onClick={applyPaste}
              className="flex-1 px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
              Apply
            </button>
            <button onClick={()=>{setPasteOpen(false); setPasteErr(false)}}
              className="flex-1 px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {p.showJson && (
        <div className="flex flex-col gap-1">
          <div className="text-white/40">Clipboard blocked — copy manually</div>
          <textarea readOnly value={p.showJson} rows={7} autoFocus
            onFocus={e=>e.target.select()}
            className="w-full bg-black/60 border border-white/20 text-white/80 p-2 text-[9px] normal-case tracking-normal font-mono resize-none" />
          <button onClick={()=>p.setShowJson(null)}
            className="px-2 py-1.5 border border-white/20 text-white/60 hover:text-white hover:border-white/60 transition-colors">
            Close
          </button>
        </div>
      )}

      {p.saved.length>0 && (
        <div className="flex flex-col gap-1.5">
          <div className="text-white/40">Saved</div>
          {p.saved.map((s,i)=>(
            <div key={i} className="flex items-center gap-2">
              <button onClick={()=>p.setPal(s.pal)}
                className="flex-1 flex items-center gap-2 px-2 py-1.5 border border-white/20 hover:border-white/60 transition-colors">
                <span className="flex gap-0.5">
                  <span className="w-3 h-3" style={{background:s.pal.bg}} />
                  {s.pal.rows.map((c,j)=><span key={j} className="w-3 h-3" style={{background:c}} />)}
                </span>
                <span className="text-white/50">{s.name}</span>
              </button>
              <button onClick={()=>p.deletePalette(i)}
                className="px-2 py-1.5 border border-white/20 text-white/40 hover:text-white hover:border-white/60 transition-colors">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
