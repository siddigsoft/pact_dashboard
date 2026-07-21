import { useState } from 'react';
import { Folder, File, FileText, Image, LayoutGrid, List, Search, Upload, Plus, ChevronRight, Star, Clock, Trash2, HardDrive, Users, Shield, MoreVertical, Download, Share2, Eye } from 'lucide-react';

const folders = [
  { id: 1, name: 'HR Documents', files: 24, color: '#4285F4', starred: true },
  { id: 2, name: 'Finance Reports', files: 18, color: '#34A853', starred: false },
  { id: 3, name: 'Field Operations', files: 42, color: '#FBBC04', starred: true },
  { id: 4, name: 'Contracts', files: 9, color: '#EA4335', starred: false },
  { id: 5, name: 'Training Materials', files: 31, color: '#9334E6', starred: false },
  { id: 6, name: 'Site Visits', files: 15, color: '#1AA260', starred: false },
];

const files = [
  { id: 1, name: 'Annual Report 2025.pdf', size: '2.4 MB', modified: '2h ago', type: 'pdf' },
  { id: 2, name: 'Budget Forecast Q3.xlsx', size: '890 KB', modified: 'Yesterday', type: 'sheet' },
  { id: 3, name: 'Staff Handbook.docx', size: '1.1 MB', modified: '3 days ago', type: 'doc' },
  { id: 4, name: 'Site Map Overview.png', size: '4.2 MB', modified: '1 week ago', type: 'image' },
];

const sidebarItems = [
  { icon: HardDrive, label: 'My Drive', active: true },
  { icon: Users, label: 'Shared with me' },
  { icon: Clock, label: 'Recent' },
  { icon: Star, label: 'Starred' },
  { icon: Trash2, label: 'Trash' },
];

const typeColors: Record<string, string> = { pdf: '#EA4335', sheet: '#34A853', doc: '#4285F4', image: '#FBBC04' };
const typeLabels: Record<string, string> = { pdf: 'PDF', sheet: 'XLS', doc: 'DOC', image: 'IMG' };

export function DriveLayout() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<number | null>(null);

  return (
    <div className="flex h-screen bg-white font-sans text-sm overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 flex flex-col border-r border-gray-200 bg-gray-50 shrink-0">
        <div className="p-4 flex items-center gap-2 border-b border-gray-200">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <HardDrive className="w-4 h-4 text-white" />
          </div>
          <span className="font-semibold text-gray-800 text-base">Workspace</span>
        </div>

        <button className="mx-3 mt-3 flex items-center gap-2 bg-white border border-gray-300 rounded-full px-4 py-2 text-gray-700 hover:bg-gray-50 shadow-sm text-xs font-medium">
          <Plus className="w-3.5 h-3.5" /> New
        </button>

        <nav className="mt-4 px-2 flex-1">
          {sidebarItems.map(item => (
            <button key={item.label} className={`w-full flex items-center gap-3 px-3 py-2 rounded-full text-left text-sm mb-0.5 ${item.active ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-200'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1.5">Storage</div>
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full" style={{ width: '63%' }} />
          </div>
          <div className="text-xs text-gray-500 mt-1">6.3 GB of 10 GB used</div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-200 bg-white">
          <div className="flex-1 flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2 max-w-xl">
            <Search className="w-4 h-4 text-gray-400" />
            <input className="bg-transparent outline-none text-sm text-gray-600 flex-1 placeholder-gray-400" placeholder="Search in Drive" />
          </div>
          <button className="flex items-center gap-2 bg-blue-600 text-white text-xs font-medium px-3 py-2 rounded-md hover:bg-blue-700">
            <Upload className="w-3.5 h-3.5" /> Upload
          </button>
          <button onClick={() => setView(view === 'grid' ? 'list' : 'grid')} className="p-2 rounded-full hover:bg-gray-100 text-gray-500">
            {view === 'grid' ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-gray-500 mb-5">
            <span className="hover:text-blue-600 cursor-pointer">My Drive</span>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-gray-800 font-medium">Documents</span>
          </div>

          {/* Folders */}
          <div className="mb-6">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Folders</h3>
            <div className={`grid gap-3 ${view === 'grid' ? 'grid-cols-3' : 'grid-cols-1'}`}>
              {folders.map(f => (
                <div key={f.id} onClick={() => setSelected(f.id)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${selected === f.id ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                  <Folder className="w-5 h-5 shrink-0" style={{ color: f.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                    <div className="text-xs text-gray-400">{f.files} files</div>
                  </div>
                  {f.starred && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          {/* Files */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Files</h3>
            {view === 'grid' ? (
              <div className="grid grid-cols-4 gap-3">
                {files.map(f => (
                  <div key={f.id} className="border border-gray-200 rounded-xl overflow-hidden hover:shadow-md cursor-pointer group transition-all">
                    <div className="h-24 flex items-center justify-center" style={{ background: typeColors[f.type] + '18' }}>
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: typeColors[f.type] }}>
                        {typeLabels[f.type]}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-xs font-medium text-gray-800 truncate">{f.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{f.size} · {f.modified}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                {files.map((f, i) => (
                  <div key={f.id} className={`flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: typeColors[f.type] }}>{typeLabels[f.type]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{f.name}</div>
                    </div>
                    <span className="text-xs text-gray-400 w-20 text-right">{f.size}</span>
                    <span className="text-xs text-gray-400 w-24 text-right">{f.modified}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                      <button className="p-1 rounded hover:bg-gray-200"><Eye className="w-3.5 h-3.5" /></button>
                      <button className="p-1 rounded hover:bg-gray-200"><Download className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
