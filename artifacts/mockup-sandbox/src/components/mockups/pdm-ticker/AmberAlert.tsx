import { AlertTriangle } from "lucide-react";

const MESSAGES = [
  "MMP Cycle 4 closes 15 Apr — all field teams must submit reports by end of day",
  "New deviation report required for all Khartoum localities — submit to supervisor",
  "White Nile data collection extended to 20 Apr due to access constraints",
  "River Nile final coverage: 463 / 500 HHs reached — follow-up in progress",
];

export function AmberAlert() {
  const fullText = MESSAGES.join("   ⚠   ") + "   ⚠   " + MESSAGES.join("   ⚠   ");

  return (
    <div className="w-full h-[160px] flex flex-col font-sans">
      {/* Simulated dashboard background */}
      <div className="flex-1 bg-gradient-to-b from-slate-800 to-slate-900 flex items-end pb-2 px-4 overflow-hidden">
        <div className="flex gap-3 opacity-15">
          {[90, 70, 110, 55, 85, 40].map((v, i) => (
            <div key={i} className="flex flex-col items-end">
              <div className="w-6 rounded-t bg-amber-400/60" style={{ height: `${v * 0.35}px` }} />
            </div>
          ))}
        </div>
        <div className="flex-1" />
        <div className="text-amber-300/20 text-[10px] font-mono">DCT PDM DASHBOARD · 2026</div>
      </div>

      {/* Alert bar */}
      <div className="h-[52px] flex-shrink-0 overflow-hidden flex items-stretch"
        style={{ background: "linear-gradient(90deg, #d97706 0%, #ea580c 100%)" }}>
        {/* Icon label */}
        <div className="flex items-center gap-2 px-4 border-r border-white/25 flex-shrink-0 bg-black/10">
          <AlertTriangle className="h-4 w-4 text-white" strokeWidth={2.5} />
          <span className="text-white text-[11px] font-black tracking-widest uppercase">Notice</span>
        </div>

        {/* Scrolling text */}
        <div className="flex-1 overflow-hidden flex items-center">
          <style>{`
            @keyframes amber-scroll {
              from { transform: translateX(0%); }
              to   { transform: translateX(-50%); }
            }
            .amber-text {
              animation: amber-scroll 35s linear infinite;
              white-space: nowrap;
              display: inline-block;
            }
            .amber-text:hover { animation-play-state: paused; }
          `}</style>
          <div className="amber-text text-white text-[13px] font-semibold drop-shadow">
            {fullText}
          </div>
        </div>

        {/* Dismiss x */}
        <button className="px-4 text-white/70 hover:text-white text-lg leading-none flex-shrink-0 border-l border-white/25 hover:bg-black/10 transition-colors">
          ×
        </button>
      </div>
    </div>
  );
}
