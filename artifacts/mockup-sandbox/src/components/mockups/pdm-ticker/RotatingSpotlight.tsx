import { useEffect, useState } from "react";

const MESSAGES = [
  { text: "MMP Cycle 4 closes 15 Apr — all field teams must submit by end of day", tag: "DEADLINE" },
  { text: "New deviation report required for Khartoum localities — submit to supervisor", tag: "ACTION" },
  { text: "White Nile data collection extended to 20 Apr due to access constraints", tag: "UPDATE" },
  { text: "River Nile: 463 / 500 HHs reached — follow-up visits in progress", tag: "PROGRESS" },
  { text: "PDM Dashboard updated — upload latest survey data to reflect current totals", tag: "SYSTEM" },
];

const TAG_COLOR: Record<string, string> = {
  DEADLINE: "#ef4444",
  ACTION:   "#f59e0b",
  UPDATE:   "#60a5fa",
  PROGRESS: "#34d399",
  SYSTEM:   "#a78bfa",
};

export function RotatingSpotlight() {
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"enter" | "hold" | "exit">("enter");
  const [progress, setProgress] = useState(0);

  const HOLD_MS = 5000;
  const TRANS_MS = 500;

  useEffect(() => {
    let rafId: number;
    let startTime: number;

    const runCycle = () => {
      setPhase("enter");
      setProgress(0);

      setTimeout(() => {
        setPhase("hold");
        startTime = performance.now();

        const tick = () => {
          const elapsed = performance.now() - startTime;
          setProgress(Math.min(elapsed / HOLD_MS, 1));
          if (elapsed < HOLD_MS) {
            rafId = requestAnimationFrame(tick);
          } else {
            setPhase("exit");
            setTimeout(() => {
              setIdx(i => (i + 1) % MESSAGES.length);
              runCycle();
            }, TRANS_MS);
          }
        };
        rafId = requestAnimationFrame(tick);
      }, TRANS_MS);
    };

    runCycle();
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, []);

  const msg = MESSAGES[idx];
  const tagColor = TAG_COLOR[msg.tag];
  const translateX = phase === "enter" ? "translateX(60px)" : phase === "exit" ? "translateX(-60px)" : "translateX(0)";
  const opacity = phase === "hold" ? 1 : 0;

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

      {/* Spotlight bar */}
      <div
        className="flex-shrink-0 flex flex-col"
        style={{ background: "#0F2041", borderTop: "1px solid #2d4a7a" }}
      >
        <div className="flex items-center gap-0 h-[54px]">
          {/* PACT anchor */}
          <div
            className="flex items-center gap-2 px-4 h-full flex-shrink-0"
            style={{ borderRight: "1px solid #2d4a7a", background: "#08152e" }}
          >
            <span className="text-[13px] font-black tracking-[0.2em]" style={{ color: "#f5c842" }}>PACT</span>
          </div>

          {/* Tag pill */}
          <div
            className="flex items-center px-3 h-full flex-shrink-0 transition-all duration-500"
            style={{ borderRight: "1px solid #2d4a7a", background: `${tagColor}22` }}
          >
            <span className="text-[10px] font-black tracking-widest" style={{ color: tagColor }}>
              {msg.tag}
            </span>
          </div>

          {/* Sliding message */}
          <div className="flex-1 overflow-hidden px-5 flex items-center h-full">
            <div
              className="text-[14px] font-semibold leading-snug transition-all"
              style={{
                color: "#e2e8f0",
                transform: translateX,
                opacity,
                transitionDuration: `${TRANS_MS}ms`,
              }}
            >
              {msg.text}
            </div>
          </div>

          {/* Counter */}
          <div className="px-4 flex-shrink-0 text-blue-400/50 text-[11px] font-mono border-l border-blue-900/50 h-full flex items-center">
            {idx + 1}/{MESSAGES.length}
          </div>
        </div>

        {/* Progress bar */}
        <div className="h-[3px] w-full" style={{ background: "#1a2d50" }}>
          <div
            className="h-full transition-none"
            style={{ width: `${progress * 100}%`, background: tagColor }}
          />
        </div>
      </div>
    </div>
  );
}
