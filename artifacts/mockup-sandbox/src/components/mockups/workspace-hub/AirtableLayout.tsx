import { useState } from 'react';
import { Search, Plus, Filter, ChevronDown, Grid, List, Star, Eye, Download, Share2, MoreHorizontal, Upload, SortAsc, Users, FileText, Image, Archive } from 'lucide-react';

const columns = [
  { key: 'name', label: 'Name', width: 'w-56', sortable: true },
  { key: 'type', label: 'Type', width: 'w-20', sortable: true },
  { key: 'folder', label: 'Folder', width: 'w-32', sortable: true },
  { key: 'security', label: 'Security', width: 'w-28', sortable: true },
  { key: 'size', label: 'Size', width: 'w-20', sortable: true },
  { key: 'modified', label: 'Modified', width: 'w-28', sortable: true },
  { key: 'by', label: 'Uploaded by', width: 'w-28', sortable: true },
  { key: 'shared', label: 'Shared', width: 'w-20', sortable: false },
];

const rows = [
  { id: 1, name: 'Annual Strategy 2026.pdf', type: 'PDF', folder: 'Finance', security: 'Top Secret', size: '4.1 MB', modified: 'Jul 20', by: 'Elsiddig I.', shared: true, starred: true, typeColor: '#ef4444' },
  { id: 2, name: 'Staff Deployment Plan', type: 'DOC', folder: 'HR', security: 'Internal', size: '680 KB', modified: 'Jul 19', by: 'Amira K.', shared: false, starred: false, typeColor: '#3b82f6' },
  { id: 3, name: 'Budget vs Actuals Q3', type: 'XLS', folder: 'Finance', security: 'Confidential', size: '1.3 MB', modified: 'Jul 18', by: 'Finance Team', shared: true, starred: true, typeColor: '#22c55e' },
  { id: 4, name: 'Partner MOU Khartoum', type: 'PDF', folder: 'Legal', security: 'Internal', size: '540 KB', modified: 'Jul 17', by: 'Lena M.', shared: false, starred: false, typeColor: '#ef4444' },
  { id: 5, name: 'Field Photos July.zip', type: 'ZIP', folder: 'Field Ops', security: 'Internal', size: '18.4 MB', modified: 'Jul 15', by: 'Marcus T.', shared: false, starred: false, typeColor: '#f59e0b' },
  { id: 6, name: 'Site Map East Darfur', type: 'IMG', folder: 'Field Ops', security: 'Internal', size: '8.1 MB', modified: 'Jul 12', by: 'David O.', shared: true, starred: false, typeColor: '#a855f7' },
  { id: 7, name: 'Training Manual v3', type: 'PDF', folder: 'HR', security: 'Internal', size: '3.8 MB', modified: 'Jul 10', by: 'Amira K.', shared: true, starred: false, typeColor: '#ef4444' },
];

const secColors: Record<string, string> = {
  'Top Secret': 'bg-red-100 text-red-700 border border-red-200',
  'Confidential': 'bg-orange-100 text-orange-700 border border-orange-200',
  'Internal': 'bg-blue-100 text-blue-700 border border-blue-200',
};
const folderColors: Record<string, string> = {
  Finance: 'bg-green-100 text-green-700',
  HR: 'bg-purple-100 text-purple-700',
  Legal: 'bg-yellow-100 text-yellow-700',
  'Field Ops': 'bg-blue-100 text-blue-700',
};

export function AirtableLayout() {
  const [selected, setSelected] = useState<number[]>([]);
  const [sortCol, setSortCol] = useState('modified');

  const toggleRow = (id: number) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(s => s.length === rows.length ? [] : rows.map(r => r.id));

  return (
    <div className="flex h-screen bg-gray-50 font-sans text-sm overflow-hidden">
      {/* Left panel */}
      <div className="w-52 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-4 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg" style={{ background: 'linear-gradient(135deg, #FFCC01, #FF6933)' }} />
            <span className="font-semibold text-gray-800 text-sm">PACT Files</span>
          </div>
        </div>

        <div className="flex-1 p-3">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Views</div>
          {[
            { icon: Grid, label: 'Grid view', active: true },
            { icon: List, label: 'Gallery view' },
            { icon: Users, label: 'Kanban view' },
          ].map(v => (
            <button key={v.label} className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs text-left mb-0.5 ${v.active ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
              <v.icon className="w-3.5 h-3.5" /> {v.label}
            </button>
          ))}

          <div className="mt-4 text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Folders</div>
          {['HR', 'Finance', 'Legal', 'Field Ops', 'Operations'].map(f => (
            <button key={f} className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs text-left text-gray-600 hover:bg-gray-100 mb-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: { HR: '#a855f7', Finance: '#22c55e', Legal: '#f59e0b', 'Field Ops': '#3b82f6', Operations: '#ef4444' }[f] ?? '#6b7280' }} />
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center gap-3">
          <h1 className="text-base font-semibold text-gray-800">All Files</h1>
          <span className="text-xs text-gray-400">{rows.length} records</span>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg px-3 py-1.5 text-xs text-gray-500">
              <Search className="w-3.5 h-3.5" />
              <input className="bg-transparent outline-none placeholder-gray-400 w-36" placeholder="Search records…" />
            </div>
            <button className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              <Filter className="w-3 h-3" /> Filter
            </button>
            <button className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50">
              <SortAsc className="w-3 h-3" /> Sort
            </button>
            <button className="flex items-center gap-1.5 text-xs bg-[#2D7FF9] hover:bg-blue-600 text-white rounded-lg px-3 py-1.5">
              <Upload className="w-3 h-3" /> Upload
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-[#F5F5F5] z-10">
              <tr className="border-b border-gray-200">
                <th className="w-10 px-3 py-2.5 border-r border-gray-200">
                  <input type="checkbox" checked={selected.length === rows.length} onChange={toggleAll} className="accent-blue-500" />
                </th>
                <th className="w-8 px-2 py-2.5 border-r border-gray-200 text-[10px] text-gray-400 font-normal">#</th>
                {columns.map(col => (
                  <th key={col.key} onClick={() => col.sortable && setSortCol(col.key)} className={`${col.width} text-left px-3 py-2.5 border-r border-gray-200 text-xs font-semibold text-gray-500 cursor-pointer hover:bg-gray-200 whitespace-nowrap`}>
                    <div className="flex items-center gap-1">
                      {col.label}
                      {sortCol === col.key && <ChevronDown className="w-3 h-3 text-blue-500" />}
                    </div>
                  </th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.id} onClick={() => toggleRow(row.id)} className={`border-b border-gray-100 cursor-pointer group ${selected.includes(row.id) ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <input type="checkbox" checked={selected.includes(row.id)} readOnly className="accent-blue-500" />
                  </td>
                  <td className="px-2 py-2 border-r border-gray-100 text-xs text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: row.typeColor }}>{row.type.slice(0, 1)}</div>
                      <span className="text-xs font-medium text-gray-800 truncate max-w-[180px]">{row.name}</span>
                      {row.starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />}
                    </div>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <span className="text-xs font-bold text-white px-1.5 py-0.5 rounded text-[9px]" style={{ background: row.typeColor }}>{row.type}</span>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${folderColors[row.folder] ?? 'bg-gray-100 text-gray-600'}`}>{row.folder}</span>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-100">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${secColors[row.security]}`}>{row.security}</span>
                  </td>
                  <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-500">{row.size}</td>
                  <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-500">{row.modified}</td>
                  <td className="px-3 py-2 border-r border-gray-100 text-xs text-gray-500">{row.by}</td>
                  <td className="px-3 py-2 border-r border-gray-100 text-center">
                    {row.shared ? <span className="text-green-500 text-xs">✓</span> : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2 opacity-0 group-hover:opacity-100">
                    <button className="p-1 rounded hover:bg-gray-200"><MoreHorizontal className="w-3.5 h-3.5 text-gray-400" /></button>
                  </td>
                </tr>
              ))}
              {/* Add row */}
              <tr className="border-b border-gray-100">
                <td colSpan={12} className="px-5 py-2.5">
                  <button className="flex items-center gap-2 text-xs text-gray-400 hover:text-blue-500">
                    <Plus className="w-3.5 h-3.5" /> Add record
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Status bar */}
        <div className="bg-white border-t border-gray-200 px-5 py-2 flex items-center gap-4 text-xs text-gray-400">
          <span>{rows.length} records</span>
          {selected.length > 0 && <span className="text-blue-600 font-medium">{selected.length} selected</span>}
          <span className="ml-auto">Last sync: 2 min ago</span>
        </div>
      </div>
    </div>
  );
}
