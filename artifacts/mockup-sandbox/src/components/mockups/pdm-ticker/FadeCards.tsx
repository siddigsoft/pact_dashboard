import { useEffect, useState } from "react";

const MESSAGES = [
  { type: "urgent", text: "MMP Cycle 4 closes 15 Apr — all field teams must submit reports by end of day" },
  { type: "notice", text: "New deviation report required for Khartoum localities — submit to supervisor" },
  { type: "info",   text: "White Nile data collection extended to 20 Apr due to access constraints" },
  { type: "info",   text: "River Nile: 463 / 500 HHs reached — follow-up visits in progress" },
];

const TYPE_CFG: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  urgent: { label: "URGENT", bg: "bg-red-600",   text: "text-white",       dot: "bg-red-400" },
  notice: { label: "NOTICE", bg: "bg-amber-500", text: "text-white",       dot: "bg-amber-300" },
  info:   { label: "INFO",   bg: "bg-blue-600",  text: "text-white",       dot: "bg-blue-300" },
};

export function FadeCards() {
  const [idx, setIdx] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const cycle = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx(i => (i + 1) % MESSAGES.length);
        setVisible(true);
      }, 400);
    }, 4500);
    return () => clearInterval(cycle);
  }, []);

  const msg = MESSAGES[idx];
  const cfg = TYPE_CFG[msg.type];

  return (
    <div className="w-full h-[160px] flex flex-col font-sans">
      {/* Dashboard context */}
      <div
        className="flex-1 overflow-hidden relative"
        style={{ background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)" }}
      >
        <div className="absolute inset-0 flex items-center justify-center opacity-10">
          <div className="grid grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="w-8 h-6 rounded bg-slate-400" />
            ))}
          </div>
        </div>
        <div className="absolute top-2 left-3 text-slate-500/50 text-[9px] font-mono tracking-widest">
          DCT PDM DASHBOARD · 2026 SURVEY
        </div>
      </div>

      {/* Message card */}
      <div className="h-[62px] flex-shrink-0 px-4 py-2 flex items-center gap-3 bg-white border-t border-slate-200 shadow-md">
        {/* Type pill */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md flex-shrink-0 ${cfg.bg}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot} animate-pulse`} />
          <span className={`text-[10px] font-black tracking-widest ${cfg.text}`}>{cfg.label}</span>
        </div>

        {/* Message text */}
        <div
          className="flex-1 text-slate-800 text-[12.5px] font-medium leading-snug transition-all duration-400"
          style={{ opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(4px)" }}
        >
          {msg.text}
        </div>

        {/* Dot indicators */}
        <div className="flex gap-1 flex-shrink-0">
          {MESSAGES.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === idx ? "w-4 bg-slate-700" : "w-1.5 bg-slate-300"
              }`}
            />
          ))}
        </div>

        {/* X */}
        <button className="text-slate-400 hover:text-slate-700 text-lg leading-none flex-shrink-0">×</button>
      </div>
    </div>
  );
}
