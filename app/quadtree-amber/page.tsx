import QuadTree, { THEME_AMBER } from "@/components/backgrounds/QuadTree"

export default function Page() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#faf6f0] dark:bg-[#120c04]">
      <QuadTree theme={THEME_AMBER} />
    </main>
  )
}
