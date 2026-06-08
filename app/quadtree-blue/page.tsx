import QuadTree, { THEME_BLUE } from "@/components/backgrounds/QuadTree"

export default function Page() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#f0f4f9] dark:bg-[#080c14]">
      <QuadTree theme={THEME_BLUE} />
    </main>
  )
}
