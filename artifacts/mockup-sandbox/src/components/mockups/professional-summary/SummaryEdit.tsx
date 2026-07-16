import { useState } from "react";

const PRIMARY = "#3b7ef5";
const BG = "#f3f5f8";
const DARK = "#0f1829";
const SPRING = "cubic-bezier(0.34,1.4,0.64,1)";

const MAX_CHARS = 800;

const AI_EXAMPLE = `Experienced humanitarian professional with over 12 years in field operations across Sudan, South Sudan, and the Horn of Africa. Specialises in MMP cycle management, community mobilisation, and multi-agency coordination. Proven track record of managing cross-functional field teams of up to 40 staff, delivering 95%+ site coverage across complex operating environments. Holds a Master's in Development Studies from the University of Khartoum and is fluent in Arabic and English.`;

const TIPS = [
  "Focus on years of experience and key specialisations",
  "Mention the regions / humanitarian contexts you've worked in",
  "Include team size managed and measurable outcomes",
  "Add languages and highest qualification",
  "Keep it under 100 words for CV clarity",
];

type Step = "write" | "generating" | "review";

export function SummaryEdit() {
  const [step, setStep] = useState<Step>("write");
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleGenerate = () => {
    setStep("generating");
    setProgress(0);
    let p = 0;
    const t = setInterval(() => {
      p += Math.random() * 18 + 8;
      if (p >= 100) {
        p = 100;
        clearInterval(t);
        setTimeout(() => {
          setText(AI_EXAMPLE);
          setStep("review");
        }, 300);
      }
      setProgress(Math.min(p, 100));
    }, 180);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };

  const charCount = text.length;
  const pct = Math.min((charCount / MAX_CHARS) * 100, 100);
  const charColor = charCount > MAX_CHARS * 0.9 ? "#ef4444" : charCount > MAX_CHARS * 0.7 ? "#f59e0b" : "#10b981";

  return (
    <div style={{ background:BG, minHeight:"100vh", fontFamily:"'Inter',system-ui,sans-serif", padding:20, display:"flex", flexDirection:"column", gap:14 }}>
      {/* Header */}
      <div>
        <div style={{ fontSize:11, color:"#94a3b8", letterSpacing:"0.5px", textTransform:"uppercase", marginBottom:4 }}>Editing · Personal Details</div>
        <div style={{ fontSize:17, fontWeight:800, color:DARK }}>Professional Summary / Background</div>
        <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>
          A short paragraph summarising experience, expertise and background. Used in CV exports.
        </div>
      </div>

      {/* Step: Write */}
      {step === "write" && (
        <>
          {/* AI Generate banner */}
          <div style={{ background:`linear-gradient(135deg, ${DARK} 0%, #1c2d40 100%)`, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:38, height:38, borderRadius:10, background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>✨</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:"#fff", marginBottom:2 }}>Generate with AI</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>
                Gemini drafts a summary from this employee's role, hub, experience and skills on file.
              </div>
            </div>
            <button onClick={handleGenerate} style={{
              background:"linear-gradient(135deg,#6366f1,#8b5cf6)", color:"#fff",
              border:"none", borderRadius:8, padding:"9px 16px", fontSize:12, fontWeight:700,
              cursor:"pointer", flexShrink:0, boxShadow:"0 4px 12px rgba(99,102,241,0.4)",
            }}>
              Generate →
            </button>
          </div>

          {/* Divider */}
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{ flex:1, height:1, background:"#e2e8f0" }}/>
            <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>or write manually</span>
            <div style={{ flex:1, height:1, background:"#e2e8f0" }}/>
          </div>

          {/* Textarea */}
          <div style={{ background:"#fff", border:"1px solid #e8ecf3", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ padding:"10px 14px", borderBottom:"1px solid #f1f4f9", display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:13 }}>📝</span>
              <span style={{ fontSize:12, fontWeight:600, color:"#374151" }}>Write summary</span>
              <span style={{ marginLeft:"auto", fontSize:10, color:"#94a3b8" }}>Markdown supported</span>
            </div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value.slice(0, MAX_CHARS))}
              placeholder="e.g. Experienced field coordinator with 8 years in humanitarian operations across East Africa…"
              style={{
                width:"100%", minHeight:140, padding:"14px", border:"none", outline:"none", resize:"none",
                fontSize:13, lineHeight:1.75, color:"#374151", fontFamily:"inherit", boxSizing:"border-box",
                background:"transparent",
              }}
            />
            {/* Char counter */}
            <div style={{ padding:"8px 14px", borderTop:"1px solid #f1f4f9", display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ flex:1, height:4, background:"#f1f5f9", borderRadius:4, overflow:"hidden" }}>
                <div style={{ height:"100%", width:`${pct}%`, background:charColor, borderRadius:4, transition:"width 0.2s ease" }}/>
              </div>
              <span style={{ fontSize:10, color:charColor, fontWeight:600, flexShrink:0 }}>
                {charCount} / {MAX_CHARS}
              </span>
            </div>
          </div>

          {/* Writing tips */}
          <div style={{ background:"#fff", border:"1px solid #e8ecf3", borderRadius:12, padding:"12px 14px", boxShadow:"0 1px 3px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
              <span>💡</span> Writing tips
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
              {TIPS.map((tip, i) => (
                <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:8, fontSize:11.5, color:"#64748b", lineHeight:1.5 }}>
                  <span style={{ width:18, height:18, borderRadius:"50%", background:`${PRIMARY}15`, color:PRIMARY, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, flexShrink:0, marginTop:1 }}>{i+1}</span>
                  {tip}
                </div>
              ))}
            </div>
          </div>

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={!text.trim()}
            style={{
              width:"100%", padding:"12px", borderRadius:10, border:"none", cursor: text.trim() ? "pointer" : "not-allowed",
              background: text.trim() ? `linear-gradient(90deg,${DARK},#1c2d40)` : "#e2e8f0",
              color: text.trim() ? "#fff" : "#94a3b8",
              fontSize:13, fontWeight:700,
              transition:"all 0.2s ease",
              display:"flex", alignItems:"center", justifyContent:"center", gap:8,
              boxShadow: text.trim() ? "0 4px 12px rgba(15,24,41,0.25)" : "none",
            }}>
            {saved ? "✓ Saved!" : "💾 Save Summary"}
          </button>
        </>
      )}

      {/* Step: Generating */}
      {step === "generating" && (
        <div style={{ background:"#fff", border:"1px solid #e8ecf3", borderRadius:14, padding:"28px 20px", display:"flex", flexDirection:"column", alignItems:"center", gap:16, boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
          {/* Spinner */}
          <div style={{ width:56, height:56, borderRadius:"50%", border:"3px solid #e0e7ff", borderTop:`3px solid #6366f1`, animation:"spin 0.8s linear infinite" }}/>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:14, fontWeight:700, color:DARK, marginBottom:4 }}>AI is drafting your summary…</div>
            <div style={{ fontSize:12, color:"#94a3b8" }}>Reading role, hub, education and experience on file</div>
          </div>
          {/* Progress bar */}
          <div style={{ width:"100%", height:6, background:"#f1f5f9", borderRadius:6, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${progress}%`, background:"linear-gradient(90deg,#6366f1,#8b5cf6)", borderRadius:6, transition:"width 0.2s ease" }}/>
          </div>
          <div style={{ fontSize:11, color:"#a5b4fc", fontWeight:600 }}>{Math.round(progress)}% complete</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Step: Review AI draft */}
      {step === "review" && (
        <>
          <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)", border:"1px solid #ddd6fe", borderRadius:12, padding:"12px 14px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <span style={{ fontSize:16 }}>✨</span>
              <span style={{ fontSize:12, fontWeight:700, color:"#5b21b6" }}>AI-generated draft</span>
              <span style={{ marginLeft:"auto", fontSize:10, color:"#7c3aed", background:"#ede9fe", padding:"2px 8px", borderRadius:6, fontWeight:600 }}>Review before saving</span>
            </div>
            <p style={{ fontSize:12, color:"#374151", lineHeight:1.75, margin:0 }}>{text}</p>
          </div>

          <textarea
            value={text}
            onChange={e => setText(e.target.value.slice(0, MAX_CHARS))}
            style={{
              width:"100%", minHeight:130, padding:"14px", borderRadius:12,
              border:"1.5px solid #c4b5fd", outline:"none", resize:"none",
              fontSize:13, lineHeight:1.75, color:"#374151", fontFamily:"inherit",
              boxSizing:"border-box", background:"#fff",
            }}
          />

          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => { setText(""); setStep("write"); }} style={{
              flex:1, padding:"11px", borderRadius:10, border:"1px solid #e2e8f0",
              background:"#fff", color:"#64748b", fontSize:12, fontWeight:600, cursor:"pointer",
            }}>
              ↺ Re-generate
            </button>
            <button onClick={handleSave} style={{
              flex:2, padding:"11px", borderRadius:10, border:"none",
              background:`linear-gradient(90deg,${DARK},#1c2d40)`,
              color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer",
              boxShadow:"0 4px 12px rgba(15,24,41,0.25)",
              display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            }}>
              {saved ? "✓ Saved!" : "💾 Accept & Save"}
            </button>
          </div>

          <button onClick={() => { setText(""); setStep("write"); }} style={{
            width:"100%", padding:"10px", borderRadius:10, border:"none",
            background:"transparent", color:"#94a3b8", fontSize:12, cursor:"pointer",
          }}>
            Discard and write manually instead
          </button>
        </>
      )}
    </div>
  );
}
