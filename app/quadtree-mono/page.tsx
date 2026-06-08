import QuadTree, { THEME_MONO } from "@/components/backgrounds/QuadTree"

export default function Page() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#f2efe9] dark:bg-[#0f0f0f]">
      <QuadTree theme={THEME_MONO} />
    </main>
  )
}
