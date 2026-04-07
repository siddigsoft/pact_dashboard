const URGENT = [
  "⚡ MMP CYCLE 4 CLOSES 15 APR — submit all reports before midnight",
  "⚡ KHARTOUM: deviation report required — submit to supervisor immediately",
  "⚡ WHITE NILE access constraints — data collection extended to 20 Apr",
];

const INFO = [
  "River Nile: 463 of 500 HHs reached — follow-up visits scheduled for remaining households",
  "PDM Dashboard updated with latest survey data — check progress table for state-level coverage",
  "Top interviewer: أمنة الفاتح with 110 surveys · Shams Mohammed: 63 surveys this cycle",
  "Financial reconciliation period closes 18 Apr — all cost requests must be submitted by then",
];

export function DualTrack() {
  const urgentText = URGENT.join("     ·     ") + "     ·     " + URGENT.join("     ·     ") + "     ·     ";
  const infoText   = INFO.join("     ·     ")   + "     ·     " + INFO.join("     ·     ")   + "     ·     ";

  return (
    <div className="w-full h-[180px] flex flex-col font-sans">
      {/* Dashboard context */}
      <div
        className="flex-1 overflow-hidden flex items-end pb-2 px-6 gap-4"
        style={{ background: "linear-gradient(180deg, #0F2041 0%, #1a2d50 100%)" }}
      >
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

      {/* Dual track */}
      <div className="flex-shrink-0 flex" style={{ borderTop: "1px solid #2d4a7a" }}>
        {/* Left: PACT label spanning both tracks */}
        <div
          className="flex flex-col items-center justify-center w-[90px] flex-shrink-0 gap-1"
          style={{ background: "#08152e", borderRight: "1px solid #2d4a7a" }}
        >
          <span className="text-[12px] font-black tracking-[0.2em]" style={{ color: "#f5c842" }}>PACT</span>
          <div className="w-8 h-px" style={{ background: "#2d4a7a" }} />
          <span className="text-[8px] font-bold tracking-widest text-blue-400/50 uppercase">Live</span>
        </div>

        {/* Tracks */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Track 1: Urgent — right to left */}
          <div
            className="flex items-center h-[33px] overflow-hidden"
            style={{ background: "#1a0a0a", borderBottom: "1px solid #2d4a7a" }}
          >
            <div
              className="flex items-center gap-1.5 px-3 flex-shrink-0"
              style={{ borderRight: "1px solid #3f1515" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              <span className="text-[9px] font-black tracking-widest text-red-400 uppercase">Urgent</span>
            </div>
            <div className="flex-1 overflow-hidden flex items-center pl-3">
              <style>{`
                @keyframes urgent-scroll {
                  from { transform: translateX(0); }
                  to   { transform: translateX(-50%); }
                }
                .urgent-text {
                  animation: urgent-scroll 22s linear infinite;
                  white-space: nowrap;
                  display: inline-block;
                  font-size: 12px;
                  font-weight: 700;
                  color: #fca5a5;
                }
                .urgent-text:hover { animation-play-state: paused; }
              `}</style>
              <div className="urgent-text">{urgentText}</div>
            </div>
          </div>

          {/* Track 2: Info — left to right (opposite direction) */}
          <div
            className="flex items-center h-[33px] overflow-hidden"
            style={{ background: "#0a1628" }}
          >
            <div
              className="flex items-center gap-1.5 px-3 flex-shrink-0"
              style={{ borderRight: "1px solid #1e3a5f" }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400 inline-block" />
              <span className="text-[9px] font-black tracking-widest text-blue-400/70 uppercase">Updates</span>
            </div>
            <div className="flex-1 overflow-hidden flex items-center pl-3">
              <style>{`
                @keyframes info-scroll {
                  from { transform: translateX(-50%); }
                  to   { transform: translateX(0); }
                }
                .info-text {
                  animation: info-scroll 38s linear infinite;
                  white-space: nowrap;
                  display: inline-block;
                  font-size: 11px;
                  font-weight: 500;
                  color: #94a3b8;
                }
                .info-text:hover { animation-play-state: paused; }
              `}</style>
              <div className="info-text">{infoText}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
