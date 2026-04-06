import { useEffect, useRef, useState } from "react";

const MESSAGES = [
  "MMP Cycle 4 closes 15 Apr — all field teams must submit reports by end of day",
  "New deviation report required for all Khartoum localities — submit to supervisor",
  "White Nile data collection extended to 20 Apr due to access constraints",
  "River Nile final coverage: 463 / 500 HHs reached — follow-up in progress",
  "PDM Dashboard updated — upload your latest survey data to reflect current totals",
];

export function BreakingNews() {
  const [tick, setTick] = useState(0);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  const fullText = MESSAGES.map((m, i) => `${m}   ◆   `).join("");

  return (
    <div className="w-full h-[160px] flex flex-col bg-[#0a1628] font-sans">
      {/* Simulated dashboard background */}
      <div className="flex-1 relative overflow-hidden bg-gradient-to-b from-[#0F2041] to-[#0a1628] flex items-end pb-1 px-4">
        <div className="flex gap-4 opacity-20">
          {[110, 84, 63, 55, 50].map((v, i) => (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div className="w-8 rounded-sm bg-blue-400" style={{ height: `${v * 0.4}px` }} />
              <div className="w-8 h-1 bg-blue-300/40 rounded" />
            </div>
          ))}
        </div>
        <div className="absolute right-4 top-2 flex items-center gap-2 opacity-30">
          <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white text-[10px] font-mono">2026 DCT PDM SURVEY — LIVE</span>
        </div>
      </div>

      {/* Ticker bar */}
      <div className="h-[48px] bg-[#0F2041] border-t border-blue-800/60 flex items-center overflow-hidden flex-shrink-0">
        {/* Label */}
        <div className="flex items-center gap-2 px-3 border-r border-blue-700/60 flex-shrink-0 h-full bg-[#0a1628]">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-white text-[11px] font-black tracking-widest uppercase whitespace-nowrap">Important</span>
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden h-full flex items-center">
          <style>{`
            @keyframes ticker-scroll {
              0%   { transform: translateX(100%); }
              100% { transform: translateX(-300%); }
            }
            .ticker-text {
              animation: ticker-scroll 38s linear infinite;
              white-space: nowrap;
              display: inline-block;
            }
            .ticker-text:hover { animation-play-state: paused; }
          `}</style>
          <div className="ticker-text text-white text-[13px] font-medium tracking-wide" ref={textRef}>
            {fullText}{fullText}
          </div>
        </div>

        {/* Time */}
        <div className="px-3 flex-shrink-0 border-l border-blue-700/60 h-full flex items-center">
          <span className="text-blue-300 text-[11px] font-mono">
            {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      </div>
    </div>
  );
}
