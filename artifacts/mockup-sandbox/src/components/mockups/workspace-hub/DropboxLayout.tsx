import { useState } from 'react';
import { Search, Upload, Plus, Star, Clock, Users, Folder, FileText, Image, Archive, MoreVertical, Download, Share2, Trash2, ChevronDown, Bell, Settings } from 'lucide-react';

const recent = [
  { id: 1, name: 'Q3 Report Final.pdf', type: 'pdf', modified: '2 hours ago', by: 'You', size: '2.4 MB' },
  { id: 2, name: 'Staff Roster July.xlsx', type: 'xls', modified: 'Yesterday', by: 'Amira K.', size: '340 KB' },
  { id: 3, name: 'Field Photos Pack.zip', type: 'zip', modified: '2 days ago', by: 'Marcus T.', size: '18 MB' },
];

const allFiles = [
  { id: 10, name: 'HR', type: 'folder', files: 24, starred: true, color: '#0061FE' },
  { id: 11, name: 'Finance', type: 'folder', files: 18, starred: false, color: '#0061FE' },
  { id: 12, name: 'Field Operations', type: 'folder', files: 42, starred: false, color: '#0061FE' },
  { id: 13, name: 'Legal', type: 'folder', files: 9, starred: true, color: '#0061FE' },
  { id: 14, name: 'Annual Strategy.pdf', type: 'pdf', size: '4.1 MB', starred: false },
  { id: 15, name: 'Org Chart 2026.png', type: 'img', size: '880 KB', starred: false },
  { id: 16, name: 'Budget Overview.xlsx', type: 'xls', size: '1.2 MB', starred: false },
  { id: 17, name: 'Site Agreement.pdf', type: 'pdf', size: '920 KB', starred: false },
];

const typeBg: Record<string, string> = { pdf: '#FFE4E4', xls: '#E4FFE9', img: '#E9E4FF', zip: '#FFF8E4' };
const typeColor: Record<string, string> = { pdf: '#E53935', xls: '#2E7D32', img: '#6A1B9A', zip: '#F57C00' };
const typeLabel: Record<string, string> = { pdf: 'PDF', xls: 'XLS', img: 'PNG', zip: 'ZIP' };

export function DropboxLayout() {
  const [activeTab, setActiveTab] = useState<'all' | 'starred' | 'shared'>('all');
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <div className="flex h-screen bg-gray-50 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 bg-[#1E1919] text-white flex flex-col shrink-0">
        <div className="p-4 flex items-center gap-2 border-b border-white/10">
          <div className="w-7 h-7 bg-[#0061FE] rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">P</span>
          </div>
          <span className="font-semibold text-sm">PACT Files</span>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {[
            { icon: Folder, label: 'All files', active: true },
            { icon: Star, label: 'Starred' },
            { icon: Clock, label: 'Recents' },
            { icon: Users, label: 'Shared' },
            { icon: Trash2, label: 'Deleted files' },
          ].map(item => (
            <button key={item.label} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left ${item.active ? 'bg-white/10 text-white' : 'text-gray-300 hover:bg-white/5'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-white/10">
          <div className="text-xs text-gray-400 mb-1.5">Team storage</div>
          <div className="h-1 bg-white/10 rounded-full">
            <div className="h-full bg-[#0061FE] rounded-full" style={{ width: '48%' }} />
          </div>
          <div className="text-xs text-gray-400 mt-1">48 GB of 100 GB</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
          <div className="flex-1 max-w-lg">
            <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2.5 border border-transparent focus-within:border-[#0061FE] focus-within:bg-white transition-all">
              <Search className="w-4 h-4 text-gray-400" />
              <input className="bg-transparent outline-none text-sm flex-1 placeholder-gray-400" placeholder="Search everything in PACT Files" />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><Bell className="w-4 h-4" /></button>
            <button className="p-2 rounded-full hover:bg-gray-100 text-gray-500"><Settings className="w-4 h-4" /></button>
            <button className="flex items-center gap-2 bg-[#0061FE] text-white text-sm font-medium px-4 py-2 rounded-xl hover:bg-blue-700">
              <Upload className="w-4 h-4" /> Upload
            </button>
            <button className="flex items-center gap-2 bg-white text-gray-700 text-sm font-medium px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50">
              <Plus className="w-4 h-4" /> New
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {/* Recents */}
          <div className="mb-8">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Recently accessed</h2>
            <div className="grid grid-cols-3 gap-4">
              {recent.map(f => (
                <div key={f.id} className="bg-white border border-gray-200 rounded-2xl p-4 hover:shadow-md cursor-pointer transition-all group">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ background: typeBg[f.type] }}>
                    <span className="text-xs font-bold" style={{ color: typeColor[f.type] }}>{typeLabel[f.type]}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{f.modified} · {f.by}</div>
                </div>
              ))}
            </div>
          </div>

          {/* All files */}
          <div>
            <div className="flex items-center gap-4 mb-4">
              <h2 className="text-base font-semibold text-gray-900">All files</h2>
              <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
                {(['all', 'starred', 'shared'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3 py-1 rounded-md capitalize font-medium ${activeTab === tab ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500'}`}>
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {allFiles.filter(f => activeTab !== 'starred' || f.starred).map(f => (
                <div
                  key={f.id}
                  onMouseEnter={() => setHoveredId(f.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className="bg-white border border-gray-200 rounded-2xl overflow-hidden hover:shadow-lg cursor-pointer transition-all group relative"
                >
                  <div className="h-28 flex items-center justify-center" style={{ background: f.type === 'folder' ? '#EEF3FF' : (typeBg[f.type] || '#f3f4f6') }}>
                    {f.type === 'folder'
                      ? <Folder className="w-12 h-12" style={{ color: f.color }} />
                      : <span className="text-2xl font-black" style={{ color: typeColor[f.type] }}>{typeLabel[f.type]}</span>
                    }
                  </div>
                  <div className="p-3">
                    <div className="text-xs font-semibold text-gray-800 truncate">{f.name}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {f.type === 'folder' ? `${(f as any).files} items` : (f as any).size}
                    </div>
                  </div>
                  {hoveredId === f.id && (
                    <div className="absolute top-2 right-2 flex gap-1 bg-white rounded-lg shadow-md p-1 border border-gray-100">
                      <button className="p-1 rounded hover:bg-gray-100"><Star className="w-3.5 h-3.5 text-gray-500" /></button>
                      <button className="p-1 rounded hover:bg-gray-100"><Share2 className="w-3.5 h-3.5 text-gray-500" /></button>
                      <button className="p-1 rounded hover:bg-gray-100"><Download className="w-3.5 h-3.5 text-gray-500" /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
