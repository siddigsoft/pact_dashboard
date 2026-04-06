import { useEffect, useState } from "react";
import { Megaphone, AlertTriangle, Info } from "lucide-react";

const MESSAGES = [
  { type: "urgent", text: "MMP Cycle 4 closes 15 Apr — all field teams must submit by end of day" },
  { type: "notice", text: "New deviation report required for Khartoum localities — submit to supervisor" },
  { type: "info",   text: "White Nile data collection extended to 20 Apr due to access constraints" },
  { type: "info",   text: "River Nile: 463 / 500 HHs reached — follow-up visits in progress" },
  { type: "urgent", text: "PDM Dashboard updated — upload latest survey data to reflect current totals" },
];

const TYPE_CFG: Record<string, {
  label: string;
  bg: string;
  border: string;
  icon: React.ReactNode;
  textColor: string;
  trackColor: string;
}> = {
  urgent: {
    label: "URGENT",
    bg: "#dc2626",
    border: "#b91c1c",
    icon: <AlertTriangle className="h-4 w-4 text-white" />,
    textColor: "#1e293b",
    trackColor: "#fee2e2",
  },
  notice: {
    label: "NOTICE",
    bg: "#d97706",
    border: "#b45309",
    icon: <Megaphone className="h-4 w-4 text-white" />,
    textColor: "#1e293b",
    trackColor: "#fef3c7",
  },
  info: {
    label: "INFO",
    bg: "#1D3461",
    border: "#0F2041",
    icon: <Info className="h-4 w-4 text-white" />,
    textColor: "#1e293b",
    trackColor: "#eff6ff",
  },
};

function useCurrentMsg() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % MESSAGES.length), 6000);
    return () => clearInterval(id);
  }, []);
  return MESSAGES[idx];
}

export function SplitPanel() {
  const msg = useCurrentMsg();
  const cfg = TYPE_CFG[msg.type];

  const fullText = MESSAGES.map(m => m.text).join("     ·     ") + "     ·     " +
                   MESSAGES.map(m => m.text).join("     ·     ") + "     ·     ";

  return (
    <div className="w-full h-[160px] flex flex-col font-sans">
      {/* Dashboard context */}
      <div
        className="flex-1 overflow-hidden flex items-end pb-1 px-5 gap-5"
        style={{ background: "linear-gradient(160deg, #0F2041 0%, #1e3a5f 100%)" }}
      >
        {[{ l: "Reached", v: "1,287" }, { l: "Target", v: "1,660" }, { l: "States", v: "7" }].map(k => (
          <div key={k.l} className="opacity-25 flex flex-col items-center">
            <span className="text-white text-[16px] font-bold">{k.v}</span>
            <span className="text-blue-300 text-[9px] tracking-widest uppercase">{k.l}</span>
          </div>
        ))}
      </div>

      {/* Split ticker */}
      <div className="h-[52px] flex-shrink-0 flex overflow-hidden" style={{ background: cfg.trackColor }}>
        {/* Left: type block */}
        <div
          className="w-[130px] flex-shrink-0 flex flex-col items-center justify-center gap-0.5 transition-all duration-500"
          style={{ background: cfg.bg, borderRight: `2px solid ${cfg.border}` }}
        >
          {cfg.icon}
          <span className="text-white text-[9px] font-black tracking-widest uppercase">{cfg.label}</span>
        </div>

        {/* Right: scrolling text */}
        <div className="flex-1 overflow-hidden flex items-center">
          <style>{`
            @keyframes split-scroll {
              from { transform: translateX(0); }
              to   { transform: translateX(-50%); }
            }
            .split-text {
              animation: split-scroll 40s linear infinite;
              white-space: nowrap;
              display: inline-block;
            }
            .split-text:hover { animation-play-state: paused; }
          `}</style>
          <div
            className="split-text text-[13px] font-semibold"
            style={{ color: cfg.textColor }}
          >
            {fullText}
          </div>
        </div>

        {/* Progress dots */}
        <div className="flex items-center pr-3 pl-2 gap-1 flex-shrink-0 border-l border-slate-200">
          {MESSAGES.map((m, i) => (
            <div
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-colors duration-500"
              style={{ background: m.type === 'urgent' ? '#dc2626' : m.type === 'notice' ? '#d97706' : '#1D3461', opacity: msg === m ? 1 : 0.2 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
