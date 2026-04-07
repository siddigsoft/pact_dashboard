import { useEffect, useState } from "react";

const MESSAGES = [
  { text: "MMP Cycle 4 closes 15 Apr — all field teams must submit by end of day", urgency: "high" },
  { text: "New deviation report required for Khartoum localities — submit to supervisor", urgency: "medium" },
  { text: "White Nile data collection extended to 20 Apr due to access constraints", urgency: "low" },
  { text: "River Nile: 463 / 500 HHs reached — follow-up visits in progress", urgency: "low" },
];

const URGENCY_COLOR: Record<string, string> = {
  high:   "#ef4444",
  medium: "#f5c842",
  low:    "#60a5fa",
};

type Phase = "collapsed" | "expanding" | "open" | "collapsing";

export function HeartbeatPulse() {
  const [phase, setPhase] = useState<Phase>("collapsed");
  const [msgIdx, setMsgIdx] = useState(0);

  const COLLAPSED_H = 6;
  const OPEN_H = 56;
  const OPEN_MS = 7000;
  const ANIM_MS = 380;
  const PAUSE_MS = 3500;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const cycle = (i: number) => {
      setMsgIdx(i % MESSAGES.length);
      // Collapsed pause → expand
      timer = setTimeout(() => {
        setPhase("expanding");
        timer = setTimeout(() => {
          setPhase("open");
          // Hold open
          timer = setTimeout(() => {
            setPhase("collapsing");
            timer = setTimeout(() => {
              setPhase("collapsed");
              // Pause between messages
              timer = setTimeout(() => cycle(i + 1), PAUSE_MS);
            }, ANIM_MS);
          }, OPEN_MS);
        }, ANIM_MS);
      }, PAUSE_MS);
    };

    cycle(0);
    return () => clearTimeout(timer);
  }, []);

  const msg = MESSAGES[msgIdx];
  const accentColor = URGENCY_COLOR[msg.urgency];
  const barHeight = (phase === "open" || phase === "collapsing" || phase === "expanding")
    ? OPEN_H : COLLAPSED_H;
  const contentVisible = phase === "open";

  return (
    <div className="w-full h-[180px] flex flex-col font-sans">
      {/* Dashboard context */}
      <div
        className="flex-1 overflow-hidden flex items-end pb-2 px-6 gap-4 relative"
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

        {/* Hint label when collapsed */}
        {phase === "collapsed" && (
          <div
            className="absolute bottom-8 right-4 flex items-center gap-1.5 opacity-50"
          >
            <span
              className="h-1.5 w-1.5 rounded-full animate-pulse"
              style={{ background: URGENCY_COLOR[MESSAGES[(msgIdx + 1) % MESSAGES.length].urgency] }}
            />
            <span className="text-[9px] text-blue-300 font-medium tracking-widest uppercase">
              New announcement incoming
            </span>
          </div>
        )}
      </div>

      {/* Heartbeat bar — animates open/close */}
      <div
        className="flex-shrink-0 overflow-hidden flex items-center"
        style={{
          height: `${barHeight}px`,
          background: phase === "collapsed" ? accentColor : "#0F2041",
          borderTop: phase !== "collapsed" ? `1px solid ${accentColor}40` : "none",
          boxShadow: phase !== "collapsed" ? `0 -4px 20px ${accentColor}30` : "none",
          transition: `height ${ANIM_MS}ms cubic-bezier(0.34,1.56,0.64,1), background 200ms ease`,
        }}
      >
        {/* Content only when open */}
        <div
          className="flex items-center gap-0 w-full h-full overflow-hidden"
          style={{
            opacity: contentVisible ? 1 : 0,
            transition: `opacity ${ANIM_MS * 0.6}ms ease`,
          }}
        >
          {/* PACT label */}
          <div
            className="flex items-center gap-2 px-4 h-full flex-shrink-0"
            style={{ borderRight: `1px solid ${accentColor}40`, background: "#08152e" }}
          >
            <span className="text-[12px] font-black tracking-[0.2em]" style={{ color: "#f5c842" }}>PACT</span>
            <span className="h-4 w-px" style={{ background: accentColor, opacity: 0.5 }} />
            <span
              className="text-[9px] font-black tracking-widest uppercase"
              style={{ color: accentColor }}
            >
              {msg.urgency === "high" ? "URGENT" : msg.urgency === "medium" ? "NOTICE" : "UPDATE"}
            </span>
          </div>

          {/* Message */}
          <div className="flex-1 px-5 overflow-hidden">
            <p
              className="text-[13.5px] font-semibold leading-tight truncate"
              style={{ color: "#e2e8f0" }}
            >
              {msg.text}
            </p>
          </div>

          {/* Accent dot + dismiss */}
          <div className="flex items-center gap-3 pr-4 flex-shrink-0">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: accentColor }}
            />
            <button className="text-slate-500 hover:text-white text-lg leading-none">×</button>
          </div>
        </div>
      </div>
    </div>
  );
}
