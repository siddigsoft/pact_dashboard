import { useState } from 'react';
import { Search, Folder, FileText, Plus, Star, Clock, Trash2, Upload, Shield, Lock, ChevronRight, MoreHorizontal, Download, Share2, Eye, Filter, Users, Command } from 'lucide-react';

const files = [
  { id: 1, name: 'Annual Report FY2025.pdf', type: 'PDF', folder: 'Finance', size: '4.1 MB', modified: '2h ago', clearance: 'TOP SECRET', starred: true },
  { id: 2, name: 'Staff Deployment Plan.docx', type: 'DOC', folder: 'HR', size: '680 KB', modified: '5h ago', clearance: 'INTERNAL', starred: false },
  { id: 3, name: 'MMP Cycle Report Jul.xlsx', type: 'XLS', folder: 'Operations', size: '1.2 MB', modified: 'Yesterday', clearance: 'CONFIDENTIAL', starred: false },
  { id: 4, name: 'Partner MOU – Khartoum.pdf', type: 'PDF', folder: 'Legal', size: '540 KB', modified: 'Yesterday', clearance: 'INTERNAL', starred: true },
  { id: 5, name: 'Budget vs Actuals Q2.xlsx', type: 'XLS', folder: 'Finance', size: '920 KB', modified: '2 days ago', clearance: 'CONFIDENTIAL', starred: false },
  { id: 6, name: 'Training Checklist.pdf', type: 'PDF', folder: 'HR', size: '340 KB', modified: '3 days ago', clearance: 'INTERNAL', starred: false },
  { id: 7, name: 'Site Map — East Darfur.png', type: 'IMG', folder: 'Operations', size: '8.4 MB', modified: '5 days ago', clearance: 'INTERNAL', starred: false },
];

const navItems = [
  { icon: Folder, label: 'All Files', count: 847 },
  { icon: Star, label: 'Starred', count: 38 },
  { icon: Clock, label: 'Recents', count: null },
  { icon: Users, label: 'Shared', count: 124 },
  { icon: Shield, label: 'Confidential', count: 43 },
  { icon: Trash2, label: 'Trash', count: null },
];

const clearanceColors: Record<string, string> = {
  'TOP SECRET': 'bg-red-900/60 text-red-300 border border-red-700/50',
  'CONFIDENTIAL': 'bg-orange-900/60 text-orange-300 border border-orange-700/50',
  'INTERNAL': 'bg-blue-900/60 text-blue-300 border border-blue-700/50',
};
const typeColors: Record<string, string> = { PDF: '#F87171', DOC: '#60A5FA', XLS: '#34D399', IMG: '#A78BFA', ZIP: '#FBBF24' };

export function LinearDarkLayout() {
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [activeNav, setActiveNav] = useState('All Files');

  const toggle = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  return (
    <div className="flex h-screen bg-[#0F0F10] text-[#E2E2E5] font-mono text-xs overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 border-r border-white/8 flex flex-col bg-[#131316] shrink-0">
        <div className="px-4 py-4 border-b border-white/8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 bg-gradient-to-br from-indigo-500 to-violet-600 rounded-md flex items-center justify-center">
              <Folder className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-white">PACT Files</span>
          </div>

          <div className="flex items-center gap-2 bg-white/5 rounded-md px-2.5 py-1.5 border border-white/10">
            <Search className="w-3 h-3 text-gray-500" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none text-xs flex-1 placeholder-gray-600 text-gray-300" placeholder="Search… (⌘K)" />
          </div>
        </div>

        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {navItems.map(item => (
            <button
              key={item.label}
              onClick={() => setActiveNav(item.label)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left ${activeNav === item.label ? 'bg-indigo-600/20 text-indigo-300' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
            >
              <item.icon className="w-3.5 h-3.5" />
              <span className="flex-1">{item.label}</span>
              {item.count !== null && <span className="text-[10px] text-gray-600">{item.count}</span>}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/8">
          <button className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 px-2 py-1.5 rounded hover:bg-white/5">
            <Plus className="w-3.5 h-3.5" /> New folder
          </button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-white/8 px-5 py-3 flex items-center gap-3 bg-[#131316]">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="hover:text-gray-300 cursor-pointer">All Files</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-300">HR Documents</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 border border-white/10 rounded px-2.5 py-1 hover:border-white/20">
              <Filter className="w-3 h-3" /> Filter
            </button>
            <button className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 border border-white/10 rounded px-2.5 py-1 hover:border-white/20">
              <Upload className="w-3 h-3" /> Upload
            </button>
            <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2.5 py-1">
              <Plus className="w-3 h-3" /> New
            </button>
          </div>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-0 px-4 py-2 border-b border-white/5 text-gray-600 uppercase tracking-wider text-[10px]">
          <div className="col-span-1"><input type="checkbox" className="accent-indigo-500" /></div>
          <div className="col-span-4">Name</div>
          <div className="col-span-2">Folder</div>
          <div className="col-span-2">Clearance</div>
          <div className="col-span-1">Size</div>
          <div className="col-span-1">Modified</div>
          <div className="col-span-1" />
        </div>

        {/* File rows */}
        <div className="flex-1 overflow-y-auto">
          {files.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).map(f => {
            const isSelected = selected.includes(f.id);
            return (
              <div
                key={f.id}
                className={`grid grid-cols-12 gap-0 px-4 py-2.5 border-b border-white/5 items-center hover:bg-white/3 group cursor-pointer ${isSelected ? 'bg-indigo-900/20' : ''}`}
              >
                <div className="col-span-1"><input type="checkbox" checked={isSelected} onChange={() => toggle(f.id)} className="accent-indigo-500" /></div>
                <div className="col-span-4 flex items-center gap-2.5 min-w-0">
                  <div className="w-6 h-6 rounded flex items-center justify-center text-[10px] font-bold text-black shrink-0" style={{ background: typeColors[f.type] }}>
                    {f.type.slice(0, 3)}
                  </div>
                  <span className="text-gray-200 truncate">{f.name}</span>
                  {f.starred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 shrink-0" />}
                </div>
                <div className="col-span-2 text-gray-500">{f.folder}</div>
                <div className="col-span-2">
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${clearanceColors[f.clearance]}`}>{f.clearance}</span>
                </div>
                <div className="col-span-1 text-gray-600">{f.size}</div>
                <div className="col-span-1 text-gray-600">{f.modified}</div>
                <div className="col-span-1 flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <button className="p-0.5 rounded hover:bg-white/10"><Eye className="w-3 h-3 text-gray-500" /></button>
                  <button className="p-0.5 rounded hover:bg-white/10"><Download className="w-3 h-3 text-gray-500" /></button>
                  <button className="p-0.5 rounded hover:bg-white/10"><MoreHorizontal className="w-3 h-3 text-gray-500" /></button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status bar */}
        <div className="border-t border-white/8 px-5 py-2 flex items-center gap-4 text-[10px] text-gray-600 bg-[#131316]">
          <span>{files.length} files</span>
          {selected.length > 0 && <span className="text-indigo-400">{selected.length} selected</span>}
          <span className="ml-auto flex items-center gap-1"><Command className="w-3 h-3" /> K for command palette</span>
        </div>
      </div>
    </div>
  );
}
