import { useState } from 'react';
import { Search, Plus, FileText, Folder, Image, File, Star, Clock, ChevronDown, ChevronRight, MoreHorizontal, Upload, Filter, ArrowUpDown } from 'lucide-react';

const tree = [
  { id: 1, name: 'HR', open: true, children: [
    { id: 11, name: 'Profiles', open: false, children: [] },
    { id: 12, name: 'Contracts', open: false, children: [] },
  ]},
  { id: 2, name: 'Finance', open: false, children: [] },
  { id: 3, name: 'Operations', open: false, children: [] },
];

const entries = [
  { id: 1, title: 'Q3 Financial Report.pdf', type: 'pdf', size: '2.1 MB', modified: 'Jul 20, 2026', by: 'Elsiddig I.', status: 'Final' },
  { id: 2, title: 'Staff Deployment Plan.docx', type: 'doc', size: '680 KB', modified: 'Jul 19, 2026', by: 'Amira K.', status: 'Draft' },
  { id: 3, title: 'Site Visit Photos.zip', type: 'zip', size: '18.4 MB', modified: 'Jul 18, 2026', by: 'Marcus T.', status: 'Final' },
  { id: 4, title: 'Budget vs Actuals.xlsx', type: 'xls', size: '1.3 MB', modified: 'Jul 17, 2026', by: 'Elsiddig I.', status: 'Review' },
  { id: 5, title: 'Partner MOU Template.pdf', type: 'pdf', size: '540 KB', modified: 'Jul 15, 2026', by: 'Lena M.', status: 'Final' },
  { id: 6, title: 'Training Manual v2.pdf', type: 'pdf', size: '3.8 MB', modified: 'Jul 12, 2026', by: 'David O.', status: 'Draft' },
];

const typeColors: Record<string, string> = { pdf: '#ef4444', doc: '#3b82f6', xls: '#22c55e', zip: '#f59e0b', img: '#a855f7' };
const statusColors: Record<string, string> = { Final: 'bg-green-100 text-green-700', Draft: 'bg-yellow-100 text-yellow-700', Review: 'bg-blue-100 text-blue-700' };

function TreeNode({ node, depth = 0 }: any) {
  const [open, setOpen] = useState(node.open);
  return (
    <div>
      <button onClick={() => setOpen(!open)} className={`w-full flex items-center gap-1.5 py-1 px-2 rounded hover:bg-gray-100 text-sm text-gray-700 text-left`} style={{ paddingLeft: `${8 + depth * 16}px` }}>
        {node.children.length > 0 ? (open ? <ChevronDown className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />) : <span className="w-3" />}
        <Folder className="w-3.5 h-3.5 text-gray-400" />
        <span className="truncate">{node.name}</span>
      </button>
      {open && node.children.map((c: any) => <TreeNode key={c.id} node={c} depth={depth + 1} />)}
    </div>
  );
}

export function NotionLayout() {
  const [search, setSearch] = useState('');

  return (
    <div className="flex h-screen bg-white font-sans overflow-hidden">
      {/* Left sidebar — Notion style */}
      <div className="w-60 border-r border-gray-200 flex flex-col bg-gray-50 shrink-0">
        <div className="px-4 pt-5 pb-3">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded bg-gray-800 flex items-center justify-center">
              <FileText className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm font-semibold text-gray-800">PACT Workspace</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded px-2 py-1.5 cursor-pointer mb-0.5">
            <Search className="w-3.5 h-3.5" /> Search
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded px-2 py-1.5 cursor-pointer mb-0.5">
            <Clock className="w-3.5 h-3.5" /> Recent
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded px-2 py-1.5 cursor-pointer mb-3">
            <Star className="w-3.5 h-3.5" /> Starred
          </div>

          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2 px-2">Folders</div>
          {tree.map(n => <TreeNode key={n.id} node={n} />)}
        </div>

        <div className="mt-auto p-3 border-t border-gray-200">
          <button className="w-full flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded hover:bg-gray-200">
            <Plus className="w-3.5 h-3.5" /> New folder
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 pt-8 pb-4 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-gray-900">HR Documents</h1>
            <div className="flex gap-2">
              <button className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                <Filter className="w-3 h-3" /> Filter
              </button>
              <button className="flex items-center gap-1.5 text-xs text-gray-500 border border-gray-200 rounded-md px-3 py-1.5 hover:bg-gray-50">
                <ArrowUpDown className="w-3 h-3" /> Sort
              </button>
              <button className="flex items-center gap-1.5 text-xs bg-gray-900 text-white rounded-md px-3 py-1.5 hover:bg-gray-700">
                <Upload className="w-3 h-3" /> Upload
              </button>
            </div>
          </div>
          <p className="text-sm text-gray-400">24 files · Last updated 2 hours ago</p>
        </div>

        {/* Search bar */}
        <div className="px-8 py-3">
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-4 py-2.5 max-w-md">
            <Search className="w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} className="bg-transparent outline-none text-sm flex-1 placeholder-gray-400" placeholder="Search files…" />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-8">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4">Name</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4">Size</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4">Modified</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3 pr-4">By</th>
                <th className="text-left text-xs font-semibold text-gray-400 uppercase tracking-wide pb-3">Status</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.filter(e => e.title.toLowerCase().includes(search.toLowerCase())).map(entry => (
                <tr key={entry.id} className="group hover:bg-gray-50 cursor-pointer">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: typeColors[entry.type] }}>
                        {entry.type.toUpperCase().slice(0, 3)}
                      </div>
                      <span className="text-sm font-medium text-gray-800">{entry.title}</span>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-sm text-gray-500">{entry.size}</td>
                  <td className="py-3 pr-4 text-sm text-gray-500">{entry.modified}</td>
                  <td className="py-3 pr-4 text-sm text-gray-500">{entry.by}</td>
                  <td className="py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusColors[entry.status]}`}>{entry.status}</span>
                  </td>
                  <td className="py-3 opacity-0 group-hover:opacity-100">
                    <button className="p-1 rounded hover:bg-gray-200 text-gray-400">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
