import PillGrid from "@/components/backgrounds/PillGrid"

export default function PillGridPage() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#0a0a0a] pt-[41px]">
      <div className="absolute inset-0 top-[41px]">
        <PillGrid />
      </div>
    </main>
  )
}
