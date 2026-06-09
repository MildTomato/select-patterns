"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Canvas, useFrame } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"
import * as THREE from "three"

// ─── 3D Game of Life voxel grid ───────────────────────────────────────────────
// A 3D cellular automaton: each live cell is a small cube. Cells are colored by
// their 3D position so the cube reads as the purple/blue/orange mass in the ref.

const PALETTE = [
  new THREE.Color("#7b4fa0"), // purple
  new THREE.Color("#8aa9dd"), // cornflower blue
  new THREE.Color("#ec9f5c"), // orange
]

interface LifeConfig {
  size: number       // grid is size^3
  birthLo: number    // neighbor range for a dead cell to be born
  birthHi: number
  surviveLo: number  // neighbor range for a live cell to survive
  surviveHi: number
  density: number     // initial seed fill
  speed: number       // generations per second
}

function idx(x: number, y: number, z: number, S: number) {
  return x + y * S + z * S * S
}

function seedGrid(S: number, density: number) {
  const g = new Uint8Array(S * S * S)
  for (let i = 0; i < g.length; i++) g[i] = Math.random() < density ? 1 : 0
  return g
}

function stepGrid(g: Uint8Array, S: number, cfg: LifeConfig) {
  const next = new Uint8Array(S * S * S)
  for (let z = 0; z < S; z++) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let n = 0
        for (let dz = -1; dz <= 1; dz++) {
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0 && dz === 0) continue
              const nx = x + dx, ny = y + dy, nz = z + dz
              if (nx < 0 || ny < 0 || nz < 0 || nx >= S || ny >= S || nz >= S) continue
              n += g[idx(nx, ny, nz, S)]
            }
          }
        }
        const alive = g[idx(x, y, z, S)] === 1
        const live = alive
          ? n >= cfg.surviveLo && n <= cfg.surviveHi
          : n >= cfg.birthLo && n <= cfg.birthHi
        next[idx(x, y, z, S)] = live ? 1 : 0
      }
    }
  }
  return next
}

function Voxels({ cfg, running, resetSignal }: { cfg: LifeConfig; running: boolean; resetSignal: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const gridRef = useRef<Uint8Array>(seedGrid(cfg.size, cfg.density))
  const accum = useRef(0)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  const S = cfg.size
  const maxInstances = S * S * S
  const half = (S - 1) / 2

  // Reseed when size or reset changes
  useEffect(() => {
    gridRef.current = seedGrid(cfg.size, cfg.density)
    accum.current = 0
  }, [cfg.size, cfg.density, resetSignal])

  useFrame((_, delta) => {
    const mesh = meshRef.current
    if (!mesh) return

    if (running) {
      accum.current += delta
      const interval = 1 / cfg.speed
      if (accum.current >= interval) {
        accum.current = 0
        let g = stepGrid(gridRef.current, S, cfg)
        // Reseed if the population collapses so it never goes empty
        let live = 0
        for (let i = 0; i < g.length; i++) live += g[i]
        if (live < g.length * 0.01) g = seedGrid(S, cfg.density)
        gridRef.current = g
      }
    }

    // Rebuild instances
    const g = gridRef.current
    let count = 0
    for (let z = 0; z < S; z++) {
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          if (g[idx(x, y, z, S)] === 0) continue
          dummy.position.set(x - half, y - half, z - half)
          dummy.updateMatrix()
          mesh.setMatrixAt(count, dummy.matrix)

          // Color by dominant axis position -> 3 palette buckets
          const sum = x + y + z
          const bucket = sum % 3
          color.copy(PALETTE[bucket])
          // Slight depth shading
          const shade = 0.75 + 0.25 * (z / (S - 1))
          color.multiplyScalar(shade)
          mesh.setColorAt(count, color)
          count++
        }
      }
    }
    mesh.count = count
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, maxInstances]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[0.92, 0.92, 0.92]} />
      <meshStandardMaterial roughness={0.55} metalness={0.05} />
    </instancedMesh>
  )
}

function BoundingBox({ size }: { size: number }) {
  const s = size
  return (
    <lineSegments>
      <edgesGeometry args={[new THREE.BoxGeometry(s, s, s)]} />
      <lineBasicMaterial color="#3a3a3a" transparent opacity={0.4} />
    </lineSegments>
  )
}

const DEFAULTS: LifeConfig = {
  size: 18,
  birthLo: 6,
  birthHi: 8,
  surviveLo: 5,
  surviveHi: 7,
  density: 0.38,
  speed: 4,
}

const SLIDERS: { key: keyof LifeConfig; label: string; min: number; max: number; step: number }[] = [
  { key: "size",      label: "Grid size",   min: 6,  max: 28, step: 1 },
  { key: "speed",     label: "Speed",       min: 1,  max: 20, step: 1 },
  { key: "density",   label: "Seed density", min: 0.1, max: 0.6, step: 0.02 },
  { key: "birthLo",   label: "Birth min",   min: 1,  max: 26, step: 1 },
  { key: "birthHi",   label: "Birth max",   min: 1,  max: 26, step: 1 },
  { key: "surviveLo", label: "Survive min", min: 1,  max: 26, step: 1 },
  { key: "surviveHi", label: "Survive max", min: 1,  max: 26, step: 1 },
]

export default function VoxelLife() {
  const [cfg, setCfg] = useState<LifeConfig>(DEFAULTS)
  const [running, setRunning] = useState(true)
  const [resetSignal, setResetSignal] = useState(0)

  const set = (key: keyof LifeConfig, value: number) =>
    setCfg(prev => ({ ...prev, [key]: value }))

  return (
    <div className="absolute inset-0">
      <Canvas
        shadows
        camera={{ position: [26, 20, 28], fov: 40 }}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#f2efe9"]} />
        <ambientLight intensity={0.6} />
        <directionalLight position={[20, 30, 20]} intensity={1.1} castShadow />
        <directionalLight position={[-15, -10, -20]} intensity={0.35} />

        <group>
          <Voxels cfg={cfg} running={running} resetSignal={resetSignal} />
          <BoundingBox size={cfg.size} />
        </group>

        <OrbitControls enablePan={false} minDistance={12} maxDistance={70} autoRotate autoRotateSpeed={0.6} />
      </Canvas>

      {/* Controls */}
      <div className="absolute top-6 right-6 z-50 flex w-60 flex-col gap-3 rounded-lg border border-border bg-background/80 px-4 py-3 font-mono text-xs backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRunning(r => !r)}
            className="flex-1 rounded border border-border px-3 py-1.5 uppercase tracking-wider transition-colors hover:bg-muted"
          >
            {running ? "Pause" : "Play"}
          </button>
          <button
            onClick={() => setResetSignal(s => s + 1)}
            className="flex-1 rounded border border-border px-3 py-1.5 uppercase tracking-wider transition-colors hover:bg-muted"
          >
            Reset
          </button>
        </div>

        {SLIDERS.map(s => (
          <label key={s.key} className="flex flex-col gap-1">
            <span className="flex items-center justify-between uppercase tracking-wider text-muted-foreground">
              <span>{s.label}</span>
              <span className="text-foreground">{cfg[s.key]}</span>
            </span>
            <input
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={cfg[s.key]}
              onChange={e => set(s.key, Number(e.target.value))}
              className="w-full accent-foreground"
            />
          </label>
        ))}

        <button
          onClick={() => { setCfg(DEFAULTS); setResetSignal(s => s + 1) }}
          className="mt-1 rounded border border-border px-3 py-1.5 uppercase tracking-wider transition-colors hover:bg-muted"
        >
          Reset controls
        </button>
      </div>
    </div>
  )
}
