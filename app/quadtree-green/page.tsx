import QuadTree, { THEME_GREEN } from "@/components/backgrounds/QuadTree"

export default function Page() {
  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#f2efe9] dark:bg-[#060e0a]">
      <QuadTree theme={THEME_GREEN} />
    </main>
  )
}
