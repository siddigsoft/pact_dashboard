import { useState } from 'react';
import { Search, Plus, Grid, List, Star, Clock, Users, Folder, MoreHorizontal, Upload, Filter, ChevronDown, Share2 } from 'lucide-react';

const projects = [
  { id: 1, name: 'HR Documents', count: 24, color: '#FF6B6B', emoji: '👤', lastModified: '2h ago', members: 4 },
  { id: 2, name: 'Finance Reports', count: 18, color: '#4ECDC4', emoji: '💰', lastModified: 'Yesterday', members: 3 },
  { id: 3, name: 'Field Operations', count: 42, color: '#45B7D1', emoji: '🌍', lastModified: '2 days ago', members: 8 },
  { id: 4, name: 'Legal & Contracts', count: 9, color: '#96CEB4', emoji: '📋', lastModified: '1 week ago', members: 2 },
  { id: 5, name: 'Training Materials', count: 31, color: '#FFEAA7', emoji: '📚', lastModified: '1 week ago', members: 6 },
  { id: 6, name: 'Site Visits', count: 15, color: '#DDA0DD', emoji: '📍', lastModified: '2 weeks ago', members: 5 },
];

const recent = [
  { id: 10, title: 'Q3 Report.pdf', project: 'Finance Reports', modified: '2h ago', preview: '#FF6B6B' },
  { id: 11, title: 'Staff Roster.xlsx', project: 'HR Documents', modified: 'Yesterday', preview: '#4ECDC4' },
  { id: 12, title: 'Site Map.png', project: 'Field Ops', modified: '2d ago', preview: '#45B7D1' },
  { id: 13, title: 'Budget.xlsx', project: 'Finance', modified: '3d ago', preview: '#96CEB4' },
];

export function FigmaLayout() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <div className="flex h-screen bg-[#1E1E1E] text-white font-sans overflow-hidden">
      {/* Left sidebar */}
      <div className="w-52 bg-[#2C2C2C] border-r border-white/10 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <span className="text-xs font-black text-white">P</span>
            </div>
            <span className="text-sm font-semibold">PACT Workspace</span>
          </div>
          <div className="flex items-center gap-2 bg-black/30 rounded-lg px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input className="bg-transparent outline-none text-xs text-gray-300 flex-1 placeholder-gray-600" placeholder="Search files" />
          </div>
        </div>

        <nav className="px-2 py-3 flex-1 space-y-0.5">
          {[
            { icon: Grid, label: 'All projects', active: true },
            { icon: Clock, label: 'Recent' },
            { icon: Star, label: 'Starred' },
            { icon: Users, label: 'Shared' },
          ].map(item => (
            <button key={item.label} className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left ${item.active ? 'bg-purple-600/20 text-purple-300' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="text-xs text-gray-500 mb-1">48 GB of 100 GB</div>
          <div className="h-1 bg-white/10 rounded-full">
            <div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: '48%' }} />
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-[#2C2C2C] border-b border-white/10 px-6 py-3 flex items-center gap-3">
          <h1 className="text-base font-semibold text-white">All Files</h1>
          <div className="ml-auto flex items-center gap-2">
            <button className="flex items-center gap-1.5 text-xs text-gray-400 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 hover:text-white">
              <Filter className="w-3 h-3" /> Filter <ChevronDown className="w-3 h-3" />
            </button>
            <button className="flex items-center gap-1.5 text-xs text-gray-400 border border-white/10 rounded-lg px-3 py-1.5 hover:border-white/20 hover:text-white">
              <Upload className="w-3 h-3" /> Upload
            </button>
            <button className="flex items-center gap-1.5 text-xs bg-purple-600 hover:bg-purple-500 text-white rounded-lg px-3 py-1.5">
              <Plus className="w-3 h-3" /> New project
            </button>
            <div className="flex border border-white/10 rounded-lg overflow-hidden">
              <button onClick={() => setView('grid')} className={`p-1.5 ${view === 'grid' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}><Grid className="w-3.5 h-3.5" /></button>
              <button onClick={() => setView('list')} className={`p-1.5 ${view === 'list' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'}`}><List className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Recent section */}
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Recently edited</h2>
            <div className="grid grid-cols-4 gap-3">
              {recent.map(f => (
                <div key={f.id} className="bg-[#2C2C2C] border border-white/10 rounded-xl overflow-hidden hover:border-white/20 cursor-pointer group transition-all">
                  <div className="h-20 flex items-center justify-center" style={{ background: f.preview + '30' }}>
                    <div className="w-10 h-12 bg-white/10 rounded flex items-center justify-center border border-white/20">
                      <span className="text-xs font-bold" style={{ color: f.preview }}>{f.title.split('.').pop()?.toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-medium text-white truncate">{f.title}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{f.project} · {f.modified}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Projects grid */}
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Projects</h2>
            <div className={view === 'grid' ? 'grid grid-cols-3 gap-4' : 'space-y-2'}>
              {projects.map(proj => (
                <div
                  key={proj.id}
                  onMouseEnter={() => setHoveredId(proj.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="bg-[#2C2C2C] border border-white/10 rounded-2xl overflow-hidden hover:border-white/20 cursor-pointer group transition-all relative"
                >
                  {/* Cover */}
                  <div className="h-28 flex items-center justify-center relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${proj.color}30, ${proj.color}10)` }}>
                    <span className="text-4xl">{proj.emoji}</span>
                    <div className="absolute inset-0 opacity-20" style={{ background: `radial-gradient(circle at 70% 30%, ${proj.color}, transparent)` }} />
                    {hoveredId === proj.id && (
                      <div className="absolute top-2 right-2 flex gap-1">
                        <button className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 backdrop-blur-sm">
                          <Star className="w-3 h-3 text-white" />
                        </button>
                        <button className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 backdrop-blur-sm">
                          <Share2 className="w-3 h-3 text-white" />
                        </button>
                        <button className="w-7 h-7 rounded-full bg-black/40 flex items-center justify-center hover:bg-black/60 backdrop-blur-sm">
                          <MoreHorizontal className="w-3 h-3 text-white" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="p-3.5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-semibold text-white">{proj.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{proj.count} files · {proj.lastModified}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      {Array.from({ length: proj.members }).slice(0, 4).map((_, i) => (
                        <div key={i} className="w-5 h-5 rounded-full border border-[#2C2C2C] text-[8px] font-bold text-white flex items-center justify-center -ml-1 first:ml-0" style={{ background: ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'][i % 4] }}>
                          {String.fromCharCode(65 + i)}
                        </div>
                      ))}
                      {proj.members > 4 && <div className="w-5 h-5 rounded-full border border-[#2C2C2C] bg-white/10 text-[8px] text-gray-400 flex items-center justify-center -ml-1">+{proj.members - 4}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
