import { useState } from 'react';
import { Search, Upload, Plus, Folder, FileText, Image, Star, Clock, Users, Share2, Download, MoreHorizontal, Bell, ChevronRight, Activity, TrendingUp, Eye, Lock } from 'lucide-react';

const files = [
  { id: 1, name: 'Annual Strategy 2026.pdf', type: 'pdf', size: '4.1 MB', modified: 'Jul 20, 2026, 14:32', by: 'Elsiddig I.', shared: true, starred: true },
  { id: 2, name: 'HR Profiles — Q3.xlsx', type: 'xls', size: '1.8 MB', modified: 'Jul 19, 2026, 09:14', by: 'You', shared: false, starred: false },
  { id: 3, name: 'Site Visit Khartoum.pdf', type: 'pdf', size: '2.3 MB', modified: 'Jul 18, 2026, 16:00', by: 'Amira K.', shared: true, starred: false },
  { id: 4, name: 'Budget vs Actuals.xlsx', type: 'xls', size: '920 KB', modified: 'Jul 17, 2026, 11:45', by: 'Finance Team', shared: true, starred: true },
  { id: 5, name: 'Training Module 1.pdf', type: 'pdf', size: '6.4 MB', modified: 'Jul 15, 2026, 08:30', by: 'David O.', shared: false, starred: false },
];

const activity = [
  { id: 1, user: 'EI', action: 'Uploaded', file: 'Annual Strategy 2026.pdf', time: '2h ago', color: '#0078d4' },
  { id: 2, user: 'AK', action: 'Edited', file: 'HR Profiles — Q3.xlsx', time: '5h ago', color: '#107C10' },
  { id: 3, user: 'MT', action: 'Shared', file: 'Site Visit Khartoum.pdf', time: 'Yesterday', color: '#A4262C' },
  { id: 4, user: 'DO', action: 'Viewed', file: 'Training Module 1.pdf', time: 'Yesterday', color: '#8764B8' },
];

const typeColor: Record<string, string> = { pdf: '#D13438', xls: '#107C10', img: '#881798', zip: '#CA5010' };
const typeLabel: Record<string, string> = { pdf: 'PDF', xls: 'XLS', img: 'IMG', zip: 'ZIP' };

const stats = [
  { label: 'Total Files', value: '847', icon: FileText, color: '#0078d4' },
  { label: 'Shared', value: '124', icon: Share2, color: '#107C10' },
  { label: 'Starred', value: '38', icon: Star, color: '#CA5010' },
  { label: 'Storage Used', value: '63%', icon: TrendingUp, color: '#8764B8' },
];

export function OneDriveLayout() {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  return (
    <div className="flex h-screen bg-[#f3f2f1] font-sans text-sm overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 bg-[#0078d4] rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">P</span>
            </div>
            <span className="font-semibold text-gray-800">PACT Files</span>
          </div>
          <button className="w-full flex items-center justify-center gap-2 bg-[#0078d4] text-white text-xs font-medium py-2 rounded-sm hover:bg-blue-700">
            <Plus className="w-3.5 h-3.5" /> New
          </button>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-0.5">
          {[
            { icon: Folder, label: 'My files', active: true },
            { icon: Clock, label: 'Recent' },
            { icon: Users, label: 'Shared' },
            { icon: Star, label: 'Starred' },
            { icon: Lock, label: 'Confidential' },
            { icon: Activity, label: 'Activity' },
          ].map(item => (
            <button key={item.label} className={`w-full flex items-center gap-3 px-3 py-2 rounded text-left text-xs ${item.active ? 'bg-[#EEF5FF] text-[#0078d4] font-semibold' : 'text-gray-600 hover:bg-gray-100'}`}>
              <item.icon className="w-4 h-4" /> {item.label}
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1">63 GB of 100 GB used</div>
          <div className="h-1.5 bg-gray-200 rounded-full"><div className="h-full bg-[#0078d4] rounded-full" style={{ width: '63%' }} /></div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3">
          <div className="flex-1 max-w-md flex items-center gap-2 border border-gray-300 rounded px-3 py-1.5 hover:border-[#0078d4] focus-within:border-[#0078d4]">
            <Search className="w-3.5 h-3.5 text-gray-400" />
            <input className="bg-transparent outline-none text-sm flex-1 placeholder-gray-400" placeholder="Search files, folders, people" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button className="p-1.5 rounded hover:bg-gray-100"><Bell className="w-4 h-4 text-gray-500" /></button>
            <button className="flex items-center gap-1.5 border border-[#0078d4] text-[#0078d4] text-xs font-medium px-3 py-1.5 rounded hover:bg-blue-50">
              <Upload className="w-3.5 h-3.5" /> Upload
            </button>
          </div>
        </div>

        <div className="flex-1 flex overflow-hidden p-4 gap-4">
          {/* Main content */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-3">
              {stats.map(s => (
                <div key={s.label} className="bg-white rounded-lg p-3 border border-gray-200 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: s.color + '20' }}>
                    <s.icon className="w-4.5 h-4.5" style={{ color: s.color }} />
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-800">{s.value}</div>
                    <div className="text-xs text-gray-500">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* File table */}
            <div className="flex-1 bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                <h2 className="text-sm font-semibold text-gray-800">My Files</h2>
                <div className="flex gap-2">
                  <button className="text-xs text-[#0078d4] hover:underline">Sort</button>
                  <button className="text-xs text-[#0078d4] hover:underline">Filter</button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1">
                <table className="w-full">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Name</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Modified</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">By</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-4 py-2.5">Size</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {files.map(f => (
                      <tr key={f.id} onClick={() => setSelectedRow(f.id)} className={`border-b border-gray-100 cursor-pointer ${selectedRow === f.id ? 'bg-[#EEF5FF]' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded flex items-center justify-center text-xs font-bold text-white" style={{ background: typeColor[f.type] }}>
                              {typeLabel[f.type]}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-gray-800">{f.name}</div>
                              <div className="flex gap-1 mt-0.5">
                                {f.shared && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1">Shared</span>}
                                {f.starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{f.modified}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{f.by}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{f.size}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                            <button className="p-1 rounded hover:bg-gray-200"><Eye className="w-3.5 h-3.5 text-gray-500" /></button>
                            <button className="p-1 rounded hover:bg-gray-200"><Share2 className="w-3.5 h-3.5 text-gray-500" /></button>
                            <button className="p-1 rounded hover:bg-gray-200"><MoreHorizontal className="w-3.5 h-3.5 text-gray-500" /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Activity sidebar */}
          <div className="w-56 shrink-0 bg-white rounded-lg border border-gray-200 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">Recent Activity</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {activity.map(a => (
                <div key={a.id} className="flex gap-2.5">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: a.color }}>
                    {a.user}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-gray-700"><span className="font-medium">{a.action}</span> <span className="text-gray-500 truncate block">{a.file}</span></div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{a.time}</div>
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
