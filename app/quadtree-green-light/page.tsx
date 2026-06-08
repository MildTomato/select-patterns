import QuadTree, { THEME_GREEN } from "@/components/backgrounds/QuadTree"

export default function Page() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#f5f0eb]">
      <QuadTree theme={THEME_GREEN} mode="light" />
    </main>
  )
}
