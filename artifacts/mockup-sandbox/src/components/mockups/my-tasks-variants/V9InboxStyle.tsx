// Option 9 — Inbox / Email Style
// Tasks appear as email-thread rows with sender/assignee, unread dots, action buttons.
// Left nav with folder-like sections. Right: reading pane.

import { useState } from "react";
import {
  Archive, Star, Clock, AlertTriangle, CheckCircle2,
  Circle, ChevronRight, MoreHorizontal, Reply, Flag,
  Inbox, Send, Bookmark, Tag, Search, Plus, Paperclip,
  RefreshCw, ArrowLeft,
} from "lucide-react";

interface Task {
  id: number; title: string; from: string; avatar: string; avatarBg: string;
  priority: "high" | "medium" | "low";
  status: "overdue" | "todo" | "in_progress" | "done";
  cat: string; due: string; preview: string; unread: boolean; starred: boolean;
  tags: string[];
}

const TASKS: Task[] = [
  { id: 1, title: "Send the Transportation For March 2026", from: "Finance Team", avatar: "FT", avatarBg: "bg-red-600", priority: "high", status: "overdue", cat: "personal", due: "Apr 02", preview: "Collect all March field receipts and submit the transport cost form with supervisor signature.", unread: true, starred: true, tags: ["Finance", "Urgent"] },
  { id: 2, title: "Prepare Monthly Monitoring Plan Q2", from: "Programme", avatar: "PM", avatarBg: "bg-blue-700", priority: "high", status: "todo", cat: "project", due: "Apr 18", preview: "Coordinate with all hub supervisors before finalizing the Q2 MMP document.", unread: true, starred: false, tags: ["MMP", "Q2"] },
  { id: 3, title: "Review field data from Hub Khartoum", from: "Data Team", avatar: "DT", avatarBg: "bg-indigo-600", priority: "medium", status: "in_progress", cat: "project", due: "Apr 20", preview: "Cleaning the raw submission data and checking for outliers before dashboard update.", unread: false, starred: true, tags: ["Data", "Hub"] },
  { id: 4, title: "Coordinator weekly debrief call", from: "M&E Coordinator", avatar: "MC", avatarBg: "bg-teal-600", priority: "medium", status: "in_progress", cat: "recurring", due: "Today", preview: "Weekly check-in with all field coordinators to review progress and blockers.", unread: false, starred: false, tags: ["Recurring", "Call"] },
  { id: 5, title: "Submit staff timesheet April", from: "HR Team", avatar: "HR", avatarBg: "bg-purple-600", priority: "low", status: "todo", cat: "personal", due: "Apr 30", preview: "Submit your monthly timesheet through the HR portal before end of April.", unread: false, starred: false, tags: ["HR", "Payroll"] },
  { id: 6, title: "Update site visit report — Kassala", from: "Field Operations", avatar: "FO", avatarBg: "bg-orange-600", priority: "high", status: "todo", cat: "project", due: "Apr 22", preview: "Complete the narrative section and attach photos from the Kassala site visit.", unread: true, starred: true, tags: ["Site Visit"] },
];

const NAV = [
  { icon: Inbox, label: "All Tasks", count: 6, active: true },
  { icon: AlertTriangle, label: "Overdue", count: 1, active: false },
  { icon: Clock, label: "Due Today", count: 1, active: false },
  { icon: Star, label: "Starred", count: 3, active: false },
  { icon: Tag, label: "Project", count: 3, active: false },
  { icon: Send, label: "Personal", count: 2, active: false },
  { icon: RefreshCw, label: "Recurring", count: 1, active: false },
  { icon: Archive, label: "Done", count: 0, active: false },
];

const PRIO_DOT: Record<string, string> = { high: "bg-red-500", medium: "bg-amber-400", low: "bg-sky-400" };

export function V9InboxStyle() {
  const [selected, setSelected] = useState<Task>(TASKS[0]);
  const [starred, setStarred] = useState(new Set(TASKS.filter(t => t.starred).map(t => t.id)));

  const toggleStar = (id: number) => setStarred(prev => {
    const s = new Set(prev);
    s.has(id) ? s.delete(id) : s.add(id);
    return s;
  });

  return (
    <div className="flex h-screen bg-white font-sans text-sm overflow-hidden">
      {/* NAV SIDEBAR */}
      <aside className="w-[180px] bg-[#fafaf9] border-r border-slate-100 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-bold text-[#0F2041]">My Tasks</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">ELSIDDIG IBRAHIM</p>
        </div>
        <div className="p-2 flex-1 overflow-y-auto">
          {NAV.map((item, i) => (
            <button key={i} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg mb-0.5 text-left transition-colors ${
              item.active ? "bg-[#e8edf5] text-[#1D3461]" : "text-slate-600 hover:bg-slate-100"
            }`}>
              <item.icon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-[12px] font-medium">{item.label}</span>
              {item.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 rounded-full ${
                  item.active ? "bg-[#1D3461] text-white" : "text-slate-400"
                }`}>{item.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="p-3 border-t border-slate-100">
          <button className="w-full flex items-center gap-1.5 justify-center py-2 bg-[#1D3461] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0F2041] transition-colors">
            <Plus className="w-3.5 h-3.5" /> New Task
          </button>
        </div>
      </aside>

      {/* TASK LIST */}
      <div className="w-[340px] border-r border-slate-100 flex flex-col shrink-0">
        {/* List header */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
          <span className="text-[13px] font-bold text-slate-700 flex-1">All Tasks <span className="text-slate-400 font-normal text-[12px]">(6)</span></span>
          <button className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><Search className="w-3.5 h-3.5" /></button>
        </div>
        {/* Unread banner */}
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-1.5 text-[11px] text-blue-700 font-medium flex items-center gap-1.5">
          <div className="w-2 h-2 bg-blue-500 rounded-full" />
          3 unread tasks
        </div>
        {/* Task rows */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
          {TASKS.map(task => (
            <div
              key={task.id}
              onClick={() => setSelected(task)}
              className={`px-4 py-3 cursor-pointer transition-colors group ${
                selected?.id === task.id ? "bg-[#e8edf5]" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full ${task.avatarBg} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>
                  {task.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    {task.unread && <div className="w-2 h-2 bg-blue-500 rounded-full shrink-0" />}
                    <span className={`text-[12px] truncate ${task.unread ? "font-bold text-slate-800" : "font-medium text-slate-600"}`}>{task.from}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={e => { e.stopPropagation(); toggleStar(task.id); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Star className={`w-3.5 h-3.5 ${starred.has(task.id) ? "fill-amber-400 text-amber-400" : "text-slate-300"}`} />
                  </button>
                  <span className={`text-[10px] ${task.status === "overdue" ? "text-red-600 font-bold" : "text-slate-400"}`}>{task.due}</span>
                </div>
              </div>
              <div className="pl-9">
                <p className={`text-[12px] truncate ${task.unread ? "font-semibold text-slate-800" : "text-slate-700"}`}>{task.title}</p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">{task.preview}</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${PRIO_DOT[task.priority]}`} />
                  {task.tags.slice(0, 2).map(tag => (
                    <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-full">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* READING PANE */}
      {selected && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Task actions toolbar */}
          <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2">
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D3461] text-white text-[12px] font-semibold hover:bg-[#0F2041] transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Mark Done
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] hover:bg-slate-50 transition-colors">
              <Flag className="w-4 h-4" /> Flag
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-[12px] hover:bg-slate-50 transition-colors">
              <Archive className="w-4 h-4" /> Archive
            </button>
            <button className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:bg-slate-50 ml-auto">
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>

          {/* Task content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Subject */}
            <div className="mb-6">
              {selected.status === "overdue" && (
                <div className="flex items-center gap-2 mb-3 text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-[12px] font-semibold">This task is overdue since {selected.due}</span>
                </div>
              )}
              <h2 className="text-[20px] font-bold text-slate-900 leading-snug mb-3">{selected.title}</h2>

              {/* Meta row */}
              <div className="flex items-center gap-4 text-[12px]">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-full ${selected.avatarBg} flex items-center justify-center text-white text-[10px] font-bold`}>
                    {selected.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-700">{selected.from}</p>
                    <p className="text-slate-400 text-[10px]">{selected.cat} task</p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-3 text-slate-500">
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Due: <span className={selected.status === "overdue" ? "text-red-600 font-bold" : ""}>{selected.due}</span></span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${PRIO_DOT[selected.priority]}`} />
                    <span className="capitalize">{selected.priority} priority</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mb-5">
              {selected.tags.map(tag => (
                <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-full text-[11px] font-medium">{tag}</span>
              ))}
            </div>

            {/* Body */}
            <div className="bg-slate-50 rounded-xl p-5 mb-5">
              <p className="text-[14px] text-slate-700 leading-relaxed">{selected.preview}</p>
              <p className="text-[13px] text-slate-600 leading-relaxed mt-3">
                Please review all related documents before completing this task. Ensure all required approvals and signatures are obtained. If you face any blockers, flag this task and contact your supervisor immediately.
              </p>
            </div>

            {/* Reply area */}
            <div className="border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 mb-2">Add Notes / Comment</p>
              <textarea
                className="w-full bg-transparent text-[13px] text-slate-700 outline-none resize-none placeholder:text-slate-300"
                rows={3}
                placeholder="Write a note about this task…"
              />
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-2">
                <button className="p-1.5 text-slate-400 hover:text-slate-600"><Paperclip className="w-4 h-4" /></button>
                <button className="px-4 py-1.5 bg-[#1D3461] text-white rounded-lg text-[12px] font-semibold hover:bg-[#0F2041] transition-colors">
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
