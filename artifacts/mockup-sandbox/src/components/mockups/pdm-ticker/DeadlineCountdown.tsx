import { useEffect, useState } from "react";

const DEADLINES = [
  { label: "MMP Cycle 4 Closes", date: new Date("2026-04-15T23:59:00"), urgent: true },
  { label: "White Nile Extension", date: new Date("2026-04-20T23:59:00"), urgent: false },
];

const SUPPORT_MSGS = [
  "New deviation report required for Khartoum localities — submit to supervisor",
  "River Nile: 463 / 500 HHs reached — follow-up visits in progress",
  "Upload latest survey data to reflect current totals on the PDM dashboard",
];

function getTimeLeft(target: Date) {
  const diff = Math.max(0, target.getTime() - Date.now());
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return { d, h, m, s, diff };
}

export function DeadlineCountdown() {
  const [ticks, setTicks] = useState(0);
  const [msgIdx, setMsgIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTicks(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setMsgIdx(i => (i + 1) % SUPPORT_MSGS.length), 6000);
    return () => clearInterval(id);
  }, []);

  const dl = DEADLINES[0];
  const { d, h, m, s, diff } = getTimeLeft(dl.date);
  const isUrgent = d < 3;

  const tickerText = SUPPORT_MSGS.join("   ◆   ") + "   ◆   " + SUPPORT_MSGS.join("   ◆   ") + "   ◆   ";

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

      {/* Two-row ticker */}
      <div className="flex-shrink-0" style={{ background: "#0F2041", borderTop: "1px solid #2d4a7a" }}>
        {/* Top row: countdown */}
        <div
          className="flex items-center h-[34px]"
          style={{ borderBottom: "1px solid #2d4a7a", background: isUrgent ? "#7f1d1d" : "#08152e" }}
        >
          <div
            className="flex items-center gap-2 px-4 h-full flex-shrink-0"
            style={{ borderRight: `1px solid ${isUrgent ? "#991b1b" : "#2d4a7a"}` }}
          >
            {isUrgent && <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse inline-block" />}
            <span
              className="text-[10px] font-black tracking-widest uppercase"
              style={{ color: isUrgent ? "#fca5a5" : "#f5c842" }}
            >PACT · DEADLINE</span>
          </div>

          <div className="flex items-center gap-1 px-4 flex-shrink-0" style={{ borderRight: "1px solid #2d4a7a" }}>
            <span className="text-white text-[11px] font-medium opacity-70">{dl.label}</span>
          </div>

          <div className="flex items-center gap-3 px-4">
            {[
              { v: d, u: "D" },
              { v: h, u: "H" },
              { v: m, u: "M" },
              { v: s, u: "S" },
            ].map(({ v, u }) => (
              <div key={u} className="flex items-baseline gap-0.5">
                <span
                  className="text-[16px] font-black font-mono tabular-nums"
                  style={{ color: isUrgent ? "#fca5a5" : "#f5c842" }}
                >
                  {String(v).padStart(2, "0")}
                </span>
                <span className="text-[9px] text-blue-400/60 font-bold">{u}</span>
              </div>
            ))}
          </div>

          <div className="flex-1" />
          <span className="text-blue-400/40 text-[10px] px-3 font-mono">15 APR 2026</span>
        </div>

        {/* Bottom row: scrolling support messages */}
        <div className="flex items-center h-[28px] overflow-hidden">
          <div className="px-3 flex-shrink-0 border-r border-blue-900/50">
            <span className="text-[10px] font-semibold tracking-widest text-blue-400/60 uppercase">Also</span>
          </div>
          <div className="flex-1 overflow-hidden flex items-center pl-3">
            <style>{`
              @keyframes dl-scroll {
                from { transform: translateX(0); }
                to   { transform: translateX(-50%); }
              }
              .dl-text {
                animation: dl-scroll 32s linear infinite;
                white-space: nowrap;
                display: inline-block;
              }
              .dl-text:hover { animation-play-state: paused; }
            `}</style>
            <div className="dl-text text-[11px]" style={{ color: "#94a3b8" }}>
              {tickerText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
