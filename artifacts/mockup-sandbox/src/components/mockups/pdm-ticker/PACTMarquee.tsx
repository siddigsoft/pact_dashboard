const MESSAGES = [
  "MMP Cycle 4 closes 15 Apr — all field teams must submit by end of day",
  "New deviation report required for Khartoum localities — submit to supervisor",
  "White Nile data collection extended to 20 Apr due to access constraints",
  "River Nile: 463 / 500 HHs reached — follow-up visits in progress",
  "PDM Dashboard updated — upload latest survey data to reflect totals",
];

export function PACTMarquee() {
  const sep = "   ◆   ";
  const fullText = MESSAGES.join(sep) + sep + MESSAGES.join(sep) + sep;

  return (
    <div className="w-full h-[160px] flex flex-col font-sans">
      {/* Dashboard context */}
      <div
        className="flex-1 overflow-hidden flex items-end pb-2 px-6 gap-4"
        style={{ background: "linear-gradient(180deg, #0F2041 0%, #1a2d50 100%)" }}
      >
        {/* Mini KPI chips */}
        {[
          { label: "Reached", val: "1,287", c: "#34d399" },
          { label: "Target", val: "1,660", c: "#60a5fa" },
          { label: "Coverage", val: "77.5%", c: "#fbbf24" },
        ].map(k => (
          <div key={k.label} className="flex items-center gap-1.5 opacity-40">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: k.c }} />
            <span className="text-white text-[10px] font-mono">{k.label}: {k.val}</span>
          </div>
        ))}
        <div className="flex-1" />
        <span className="text-blue-300/30 text-[10px] font-semibold tracking-widest">PACT · 2026</span>
      </div>

      {/* Ticker */}
      <div
        className="h-[52px] flex-shrink-0 flex items-stretch overflow-hidden"
        style={{ background: "#1D3461", borderTop: "1px solid #2d4a7a" }}
      >
        {/* PACT logo block */}
        <div
          className="flex items-center px-4 gap-2 flex-shrink-0"
          style={{ borderRight: "1px solid #2d4a7a", background: "#0F2041" }}
        >
          <span
            className="text-[13px] font-black tracking-[0.2em] uppercase"
            style={{ color: "#f5c842" }}
          >PACT</span>
          <span className="text-blue-400/50 text-[16px] font-thin">|</span>
          <span className="text-blue-200/70 text-[10px] font-semibold tracking-widest uppercase">Announcement</span>
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden flex items-center">
          <style>{`
            @keyframes pact-scroll {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
            }
            .pact-text {
              animation: pact-scroll 42s linear infinite;
              white-space: nowrap;
              display: inline-block;
            }
            .pact-text:hover { animation-play-state: paused; }
            .pact-sep { color: #f5c842; font-weight: 900; }
          `}</style>
          <div className="pact-text" style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: 500 }}>
            {MESSAGES.map((m, i) => (
              <span key={i}>
                {m}
                <span className="pact-sep">   ◆   </span>
              </span>
            ))}
            {MESSAGES.map((m, i) => (
              <span key={`r${i}`}>
                {m}
                <span className="pact-sep">   ◆   </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
