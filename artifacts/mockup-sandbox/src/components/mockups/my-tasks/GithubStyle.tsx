import { useState } from "react";
import {
  Plus, Search, ChevronDown, MoreHorizontal, CheckCircle2, Circle,
  AlertCircle, Clock, Tag, User, Filter, X, Star,
  GitPullRequest, Inbox, ArrowUpRight, Milestone,
} from "lucide-react";

const LABEL_DEFS: Record<string, { color: string; bg: string }> = {
  urgent: { color: "#d73a4a", bg: "#ffeef0" },
  "in-progress": { color: "#0075ca", bg: "#cfe2ff" },
  finance: { color: "#e4e669", bg: "#fbff00" + "22" },
  "field-ops": { color: "#7057ff", bg: "#ede2ff" },
  hr: { color: "#0075ca", bg: "#d0e8ff" },
  crm: { color: "#008672", bg: "#d0f0e8" },
  ops: { color: "#e4e669", bg: "#fffbbf" },
  review: { color: "#cc6b00", bg: "#fff3cd" },
  "good-first": { color: "#7057ff", bg: "#ede2ff" },
};

const ISSUES = [
  { id: 47, title: "Review Q2 MMP coverage report", labels: ["urgent","ops","in-progress"], milestone: "MMP Cycle 4", assignees: ["EI"], opened: "Apr 8", comments: 2, starred: true, open: true },
  { id: 48, title: "Approve transport cost submissions for Kassala hub", labels: ["urgent","finance"], milestone: "Finance Q2", assignees: ["EI"], opened: "Apr 9", comments: 0, starred: false, open: true },
  { id: 43, title: "Follow up on uncovered sites in Gedaref", labels: ["field-ops","in-progress"], milestone: "MMP Cycle 4", assignees: ["EI"], opened: "Apr 6", comments: 4, starred: false, open: true },
  { id: 44, title: "Update data collector assignments for cycle 5", labels: ["ops"], milestone: "MMP Cycle 5", assignees: ["EI"], opened: "Apr 7", comments: 1, starred: false, open: true },
  { id: 39, title: "Generate payroll report — March 2026", labels: ["hr","review"], milestone: "HR March", assignees: ["EI"], opened: "Apr 1", comments: 3, starred: false, open: false },
  { id: 41, title: "Review leave requests pending approval", labels: ["hr"], milestone: "HR March", assignees: ["EI"], opened: "Apr 3", comments: 0, starred: false, open: true },
  { id: 45, title: "Sync CRM partner list with field teams", labels: ["crm"], milestone: null, assignees: ["EI"], opened: "Apr 8", comments: 0, starred: false, open: true },
];

const FILTER_LABELS = ["All open", "Assigned to me", "Mentioned me", "Starred"];

export function GithubStyle() {
  const [activeFilter, setActiveFilter] = useState("All open");
  const [search, setSearch] = useState("");
  const [closed, setClosed] = useState<Set<number>>(new Set([39]));
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const showOpen = activeFilter !== "Closed";
  const filtered = ISSUES.filter(i => {
    const isOpen = !closed.has(i.id);
    if (showOpen && !isOpen) return false;
    if (!showOpen && isOpen) return false;
    if (activeFilter === "Starred" && !i.starred) return false;
    if (search && !i.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const openCount = ISSUES.filter(i => !closed.has(i.id)).length;
  const closedCount = ISSUES.filter(i => closed.has(i.id)).length;

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] flex flex-col" style={{ fontFamily: "'Inter',system-ui,sans-serif" }}>
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#30363d] bg-[#161b22]">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-white flex items-center justify-center">
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-[#0d1117]">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </div>
          <span className="text-[13px] font-semibold text-[#e6edf3]">PACT / tasks</span>
        </div>
        <div className="flex-1 flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg px-3 h-8 max-w-md mx-4">
          <Search className="h-3.5 w-3.5 text-[#768390]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all tasks…"
            className="bg-transparent text-[12.5px] text-[#e6edf3] placeholder-[#768390] outline-none flex-1 ml-2" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-[12.5px] font-medium text-white bg-[#238636] hover:bg-[#2ea043] rounded-lg px-3 h-8 transition-colors border border-[#2ea043]/30">
            <Plus className="h-3.5 w-3.5" /> New task
          </button>
        </div>
      </div>

      {/* Issue list container */}
      <div className="flex-1 px-5 py-4 max-w-4xl w-full mx-auto">
        {/* Search + filter bar */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center bg-[#0d1117] border border-[#30363d] rounded-lg px-3 h-9">
            <Search className="h-3.5 w-3.5 text-[#768390] flex-shrink-0" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
              className="bg-transparent text-[13px] text-[#e6edf3] placeholder-[#768390] outline-none flex-1 ml-2" />
            {search && <button onClick={() => setSearch("")} className="text-[#768390] hover:text-[#e6edf3]"><X className="h-3.5 w-3.5" /></button>}
          </div>
          <button className="flex items-center gap-1 text-[12.5px] text-[#8b949e] border border-[#30363d] rounded-lg px-3 h-9 hover:bg-[#21262d] transition-colors">
            <Filter className="h-3.5 w-3.5" /> Label <ChevronDown className="h-3 w-3 ml-0.5" />
          </button>
          <button className="flex items-center gap-1 text-[12.5px] text-[#8b949e] border border-[#30363d] rounded-lg px-3 h-9 hover:bg-[#21262d] transition-colors">
            <Milestone className="h-3.5 w-3.5" /> Milestone <ChevronDown className="h-3 w-3 ml-0.5" />
          </button>
          <button className="flex items-center gap-1 text-[12.5px] text-[#8b949e] border border-[#30363d] rounded-lg px-3 h-9 hover:bg-[#21262d] transition-colors">
            <User className="h-3.5 w-3.5" /> Assignee <ChevronDown className="h-3 w-3 ml-0.5" />
          </button>
        </div>

        {/* Issues box */}
        <div className="border border-[#30363d] rounded-xl overflow-hidden bg-[#161b22]">
          {/* List header */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#30363d] bg-[#21262d]">
            <div className="flex items-center gap-4">
              <button onClick={() => setActiveFilter("All open")}
                className={`flex items-center gap-1.5 text-[13px] font-semibold transition-colors ${showOpen ? "text-[#e6edf3]" : "text-[#768390] hover:text-[#e6edf3]"}`}>
                <AlertCircle className="h-4 w-4" />
                <span>{openCount} Open</span>
              </button>
              <button onClick={() => setActiveFilter("Closed")}
                className={`flex items-center gap-1.5 text-[13px] font-semibold transition-colors ${!showOpen ? "text-[#e6edf3]" : "text-[#768390] hover:text-[#e6edf3]"}`}>
                <CheckCircle2 className="h-4 w-4" />
                <span>{closedCount} Closed</span>
              </button>
            </div>
            <div className="ml-auto flex items-center gap-3 text-[12.5px] text-[#8b949e]">
              {["Label","Milestone","Assignee","Sort"].map(f => (
                <button key={f} className="flex items-center gap-1 hover:text-[#e6edf3] transition-colors">
                  {f} <ChevronDown className="h-3 w-3" />
                </button>
              ))}
            </div>
          </div>

          {/* Issue rows */}
          {filtered.map((issue, i) => {
            const isClosed = closed.has(issue.id);
            return (
              <div key={issue.id}
                className={`flex items-start gap-3 px-4 py-3 border-b border-[#21262d] hover:bg-[#1c2128] transition-colors group cursor-pointer ${i === filtered.length - 1 ? "border-b-0" : ""}`}>
                {/* Status icon */}
                <div className="pt-0.5 flex-shrink-0">
                  {isClosed
                    ? <CheckCircle2 className="h-4.5 w-4.5 text-[#8957e5]" style={{width:18,height:18}} />
                    : <AlertCircle className="h-4.5 w-4.5 text-[#3fb950]" style={{width:18,height:18}} />}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-[14px] font-semibold hover:text-[#58a6ff] cursor-pointer transition-colors ${isClosed ? "text-[#8b949e]" : "text-[#e6edf3]"}`}>
                      {issue.title}
                    </span>
                    {issue.starred && <Star className="h-3.5 w-3.5 text-yellow-500 fill-yellow-400 flex-shrink-0" />}
                    {issue.labels.map(l => {
                      const cfg = LABEL_DEFS[l] ?? { color: "#768390", bg: "#21262d" };
                      return (
                        <span key={l} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full border"
                          style={{ color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.color + "44" }}>
                          {l}
                        </span>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-3 text-[11.5px] text-[#768390]">
                    <span>#{issue.id} opened {issue.opened}</span>
                    {issue.milestone && (
                      <span className="flex items-center gap-1">
                        <Milestone className="h-3 w-3" /> {issue.milestone}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3 flex-shrink-0 pt-0.5">
                  {/* Assignees */}
                  <div className="flex -space-x-1">
                    {issue.assignees.map(a => (
                      <div key={a} className="h-5 w-5 rounded-full bg-[#58a6ff] border-2 border-[#161b22] flex items-center justify-center text-white text-[8px] font-bold">{a}</div>
                    ))}
                  </div>
                  {/* Comments */}
                  {issue.comments > 0 && (
                    <span className="flex items-center gap-1 text-[11.5px] text-[#768390] hover:text-[#58a6ff] transition-colors">
                      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-current">
                        <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0113.25 12H9.06l-2.573 2.573A1.457 1.457 0 014 13.543V12H2.75A1.75 1.75 0 011 10.25Zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 01.75.75v2.189l2.72-2.72a.749.749 0 01.53-.219h4.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25Z" />
                      </svg>
                      {issue.comments}
                    </span>
                  )}
                  {/* Toggle close */}
                  <button onClick={(e) => { e.stopPropagation(); setClosed(prev => { const n = new Set(prev); n.has(issue.id) ? n.delete(issue.id) : n.add(issue.id); return n; }); }}
                    className="opacity-0 group-hover:opacity-100 text-[#768390] hover:text-[#e6edf3] transition-all">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="flex flex-col items-center py-10 text-[#768390]">
              <AlertCircle className="h-8 w-8 mb-2" />
              <p className="text-[13px]">No results matched your search.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
