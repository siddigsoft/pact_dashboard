import { useState } from 'react';
import { Search, Folder, FileText, Upload, Star, Clock, Shield, Users, Command, ArrowRight, Hash, Lock, Globe, Plus, Zap } from 'lucide-react';

const suggestions = [
  { group: 'Recent Files', items: [
    { icon: FileText, label: 'Annual Strategy 2026.pdf', sub: 'Finance · 2 hours ago', color: '#ef4444', kbd: null },
    { icon: FileText, label: 'Staff Deployment Plan.docx', sub: 'HR · 5 hours ago', color: '#3b82f6', kbd: null },
    { icon: FileText, label: 'Budget vs Actuals Q3.xlsx', sub: 'Finance · Yesterday', color: '#22c55e', kbd: null },
  ]},
  { group: 'Quick Actions', items: [
    { icon: Upload, label: 'Upload files', sub: 'Add new files to workspace', color: '#6366f1', kbd: 'U' },
    { icon: Plus, label: 'New folder', sub: 'Create a new folder', color: '#8b5cf6', kbd: 'N' },
    { icon: Star, label: 'View starred', sub: 'See all starred files', color: '#f59e0b', kbd: 'S' },
    { icon: Shield, label: 'Confidential files', sub: 'Access restricted documents', color: '#ef4444', kbd: 'C' },
  ]},
  { group: 'Folders', items: [
    { icon: Folder, label: 'HR Documents', sub: '24 files', color: '#4285F4', kbd: null },
    { icon: Folder, label: 'Finance Reports', sub: '18 files', color: '#34A853', kbd: null },
    { icon: Folder, label: 'Field Operations', sub: '42 files', color: '#FBBC04', kbd: null },
    { icon: Folder, label: 'Legal & Contracts', sub: '9 files', color: '#EA4335', kbd: null },
  ]},
];

const stats = [
  { icon: FileText, value: '847', label: 'Total Files' },
  { icon: Folder, value: '24', label: 'Folders' },
  { icon: Users, value: '18', label: 'Shared' },
  { icon: Shield, value: '43', label: 'Confidential' },
];

const pinned = [
  { name: 'Q3 Report.pdf', type: 'PDF', color: '#ef4444' },
  { name: 'Staff Roster.xlsx', type: 'XLS', color: '#22c55e' },
  { name: 'HR Profiles/', type: 'DIR', color: '#4285F4' },
  { name: 'Budget.xlsx', type: 'XLS', color: '#22c55e' },
];

export function CommandLayout() {
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState<string | null>(null);

  const filtered = query.length > 0
    ? suggestions.map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(query.toLowerCase())) })).filter(g => g.items.length > 0)
    : suggestions;

  return (
    <div className="flex h-screen bg-[#0A0A0F] font-sans overflow-hidden">
      {/* Left accent bar */}
      <div className="w-12 bg-[#111118] border-r border-white/5 flex flex-col items-center py-4 gap-3 shrink-0">
        {[
          { icon: Folder, label: 'Files', active: true },
          { icon: Star, label: 'Starred' },
          { icon: Clock, label: 'Recent' },
          { icon: Users, label: 'Shared' },
          { icon: Shield, label: 'Secure' },
        ].map(item => (
          <button key={item.label} title={item.label} className={`w-8 h-8 rounded-xl flex items-center justify-center ${item.active ? 'bg-indigo-600' : 'text-gray-600 hover:bg-white/5 hover:text-gray-300'}`}>
            <item.icon className="w-4 h-4 text-white" />
          </button>
        ))}
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Stats header */}
        <div className="bg-[#0F0F18] border-b border-white/5 px-6 py-3 flex items-center gap-6">
          {stats.map(s => (
            <div key={s.label} className="flex items-center gap-2">
              <s.icon className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-sm font-bold text-white">{s.value}</span>
              <span className="text-xs text-gray-600">{s.label}</span>
            </div>
          ))}
          <div className="ml-auto flex items-center gap-2 text-xs text-gray-600">
            <Command className="w-3 h-3" /> K — command palette
          </div>
        </div>

        {/* Command palette center */}
        <div className="flex-1 flex flex-col items-center justify-start pt-10 px-8 overflow-y-auto">
          {/* Search / command input */}
          <div className="w-full max-w-2xl">
            <div className="relative">
              <div className="flex items-center gap-3 bg-[#1A1A28] border border-indigo-500/50 rounded-2xl px-5 py-4 shadow-[0_0_40px_rgba(99,102,241,0.15)]">
                <Search className="w-5 h-5 text-indigo-400" />
                <input
                  className="bg-transparent outline-none text-base text-white flex-1 placeholder-gray-600"
                  placeholder="Search files, folders, or type a command…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <div className="flex items-center gap-1 text-[10px] text-gray-600 border border-white/10 rounded-md px-2 py-1">
                  <Command className="w-3 h-3" /> K
                </div>
              </div>
            </div>

            {/* Results */}
            <div className="mt-3 bg-[#13131F] border border-white/8 rounded-2xl overflow-hidden shadow-2xl">
              {filtered.map((group, gi) => (
                <div key={group.group}>
                  {gi > 0 && <div className="h-px bg-white/5" />}
                  <div className="px-4 py-2 text-[10px] font-semibold text-gray-600 uppercase tracking-wider">{group.group}</div>
                  {group.items.map(item => (
                    <button
                      key={item.label}
                      onMouseEnter={() => setFocused(item.label)}
                      onMouseLeave={() => setFocused(null)}
                      className={`w-full flex items-center gap-3.5 px-4 py-3 text-left transition-all ${focused === item.label ? 'bg-indigo-600/20' : 'hover:bg-white/3'}`}
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: item.color + '20' }}>
                        <item.icon className="w-4 h-4" style={{ color: item.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-white font-medium truncate">{item.label}</div>
                        <div className="text-xs text-gray-500 truncate">{item.sub}</div>
                      </div>
                      {item.kbd && (
                        <div className="text-[10px] border border-white/10 rounded px-1.5 py-0.5 text-gray-500">{item.kbd}</div>
                      )}
                      {focused === item.label && <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            {/* Pinned files */}
            {!query && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Zap className="w-3.5 h-3.5 text-yellow-500" />
                  <span className="text-xs font-semibold text-gray-400">Pinned Files</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {pinned.map(p => (
                    <div key={p.name} className="bg-[#13131F] border border-white/8 rounded-xl p-3 hover:border-indigo-500/40 cursor-pointer transition-all group">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white mb-2" style={{ background: p.color }}>
                        {p.type}
                      </div>
                      <div className="text-xs text-gray-300 truncate group-hover:text-white">{p.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom shortcuts bar */}
        <div className="bg-[#0F0F18] border-t border-white/5 px-6 py-2.5 flex items-center gap-6 text-[11px] text-gray-600">
          {[
            ['↑↓', 'Navigate'],
            ['↵', 'Open'],
            ['⌘ ↵', 'Open in new tab'],
            ['Esc', 'Close'],
          ].map(([k, v]) => (
            <span key={v} className="flex items-center gap-1.5">
              <span className="border border-white/10 rounded px-1.5 py-0.5 font-mono text-[10px] text-gray-400">{k}</span>
              <span>{v}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
