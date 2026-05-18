import MiniGridLight from "@/components/backgrounds/MiniGridLight"

const articles = [
  {
    fig: "FIG. 1",
    tag: "KEYNOTE",
    title: "The interface is the product",
    description: "How the next generation of developer tools are collapsing the gap between thinking and building.",
    labels: ["DESIGN", "DEVELOPER EX", "TOOLS"],
  },
  {
    fig: "FIG. 2",
    tag: "TALK",
    title: "Latency is a design material",
    description: "What distributed systems engineers can learn from typographers, and vice versa.",
    labels: ["PERFORMANCE", "SYSTEMS"],
  },
  {
    fig: "FIG. 3",
    tag: "WORKSHOP",
    title: "Build once, deploy everywhere",
    description: "A hands-on session exploring edge-first architecture and what it means to write for the network.",
    labels: ["EDGE", "INFRASTRUCTURE"],
  },
  {
    fig: "FIG. 4",
    tag: "PANEL",
    title: "Who owns the stack?",
    description: "Five engineers debate the future of platform abstraction, vendor lock-in, and open source sustainability.",
    labels: ["OPEN SOURCE", "PLATFORM"],
  },
]

const speakers = [
  { name: "MARA OKONKWO", role: "CTO, Fieldwork" },
  { name: "JIN SATO", role: "Staff Eng, Linear" },
  { name: "PRIYA MEHTA", role: "Designer, Vercel" },
  { name: "CARLOS VIDAL", role: "Founder, Depot" },
  { name: "ALEX CHEN", role: "Research, Anthropic" },
  { name: "LENA BRANDT", role: "Platform, Shopify" },
]

export default function LandingLightPage() {
  return (
    <main className="bg-[#f5f0eb] min-h-screen font-mono text-[#1a1410]">

      {/* Hero — full bleed canvas */}
      <section className="relative w-full h-screen overflow-hidden">
        <div className="absolute inset-0">
          <MiniGridLight />
        </div>
        <div className="absolute inset-0 flex flex-col justify-end p-10 pointer-events-none">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs tracking-[0.3em] text-[#1a1410]/40 mb-3">BERLIN — 14.11.26</p>
              <h1 className="text-[clamp(3rem,8vw,7rem)] font-bold leading-none tracking-tight text-balance text-[#1a1410]">
                CONF<br />&apos;26
              </h1>
            </div>
            <div className="text-right">
              <p className="text-xs tracking-[0.2em] text-[#1a1410]/40 mb-1">FOR BUILDERS</p>
              <p className="text-xs tracking-[0.2em] text-[#1a1410]/40">AND MAKERS</p>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#f5f0eb] to-transparent pointer-events-none" />
      </section>

      {/* Featured talks */}
      <section id="talks" className="border-t border-[#1a1410]/10">
        <div className="px-6 py-4 flex items-center justify-between border-b border-[#1a1410]/10">
          <span className="text-xs tracking-[0.3em] text-[#1a1410]/40">/ FEATURED TALKS</span>
          <span className="text-xs tracking-[0.3em] text-[#1a1410]/40">2026</span>
        </div>

        {articles.map((article, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-2 border-b border-[#1a1410]/10 group">
            {/* Canvas figure */}
            <div className="relative aspect-[4/3] border-r border-[#1a1410]/10 overflow-hidden">
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 border-b border-[#1a1410]/10 bg-[#f5f0eb]/60 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#1a1410]/20">&#x25A1;</span>
                  <span className="text-[10px] tracking-[0.25em] text-[#1a1410]/40">[ {article.fig} ]</span>
                </div>
                <span className="text-[10px] tracking-[0.2em] text-[#1a1410]/30 border border-[#1a1410]/15 px-1">{article.tag}</span>
              </div>
              <MiniGridLight />
            </div>

            {/* Content */}
            <div className="flex flex-col justify-center p-10 gap-5">
              <h2 className="text-[clamp(1.5rem,3vw,2.5rem)] font-bold leading-tight tracking-tight text-balance text-[#1a1410]">
                {article.title} &#x2197;
              </h2>
              <p className="text-sm text-[#1a1410]/50 leading-relaxed max-w-md">
                {article.description}
              </p>
              <div className="flex flex-wrap gap-2">
                {article.labels.map(label => (
                  <span key={label} className="text-[10px] tracking-[0.2em] border border-[#1a1410]/20 px-2 py-1 text-[#1a1410]/40">
                    {label}
                  </span>
                ))}
              </div>
              <div className="pt-2">
                <button className="text-xs tracking-[0.2em] border border-[#1a1410]/30 px-6 py-3 hover:bg-[#1a1410] hover:text-[#f5f0eb] transition-colors">
                  VIEW SESSION
                </button>
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Speakers */}
      <section id="speakers" className="border-t border-[#1a1410]/10">
        <div className="px-6 py-4 border-b border-[#1a1410]/10">
          <span className="text-xs tracking-[0.3em] text-[#1a1410]/40">/ SPEAKERS</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
          {speakers.map((s, i) => (
            <div key={i} className="border-r border-b border-[#1a1410]/10 p-6 flex flex-col gap-2 hover:bg-[#1a1410]/5 transition-colors">
              <div className="aspect-square mb-2 overflow-hidden border border-[#1a1410]/10">
                <MiniGridLight />
              </div>
              <p className="text-xs font-bold tracking-[0.15em] text-[#1a1410]">{s.name}</p>
              <p className="text-[10px] tracking-[0.15em] text-[#1a1410]/40">{s.role}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-[#1a1410]/10 px-10 py-20 flex flex-col md:flex-row items-start md:items-end justify-between gap-8">
        <div>
          <p className="text-xs tracking-[0.3em] text-[#1a1410]/40 mb-4">BERLIN — 14 NOV 2026</p>
          <h2 className="text-[clamp(2rem,6vw,5rem)] font-bold leading-none tracking-tight text-[#1a1410]">
            SEE YOU<br />THERE.
          </h2>
        </div>
        <button className="text-xs tracking-[0.2em] border border-[#1a1410] px-8 py-4 hover:bg-[#1a1410] hover:text-[#f5f0eb] transition-colors">
          REGISTER NOW
        </button>
      </section>

      <footer className="border-t border-[#1a1410]/10 px-6 py-4 flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] text-[#1a1410]/20">CONF &apos;26 — ALL RIGHTS RESERVED</span>
        <span className="text-[10px] tracking-[0.2em] text-[#1a1410]/20">VISUAL IDENTITY SYSTEM v1</span>
      </footer>
    </main>
  )
}
