import { Folder, FileText, Image, Archive, ChevronRight, Grid, List, Columns, Share2, Tag, Star, Clock, Download, Eye } from 'lucide-react';
import { useState } from 'react';

const columns = [
  {
    id: 1, title: 'Root',
    items: [
      { name: 'HR', type: 'folder', starred: true },
      { name: 'Finance', type: 'folder', starred: false },
      { name: 'Operations', type: 'folder', starred: false },
      { name: 'Projects', type: 'folder', starred: false },
      { name: 'Legal', type: 'folder', starred: false },
    ]
  },
  {
    id: 2, title: 'HR',
    items: [
      { name: 'Profiles', type: 'folder', starred: false },
      { name: 'Contracts', type: 'folder', starred: false },
      { name: 'Payroll', type: 'folder', starred: false },
      { name: 'Handbook.pdf', type: 'pdf', starred: false },
    ]
  },
  {
    id: 3, title: 'Profiles',
    items: [
      { name: 'Elsiddig_Ibrahim.pdf', type: 'pdf', starred: false },
      { name: 'Amira_Khalil.pdf', type: 'pdf', starred: false },
      { name: 'Marcus_Tutu.pdf', type: 'pdf', starred: false },
    ]
  },
];

const preview = {
  name: 'Elsiddig_Ibrahim.pdf',
  size: '1.4 MB',
  modified: 'July 20, 2026',
  created: 'June 1, 2026',
  type: 'PDF Document',
  tags: ['HR', 'Profile', 'Auto-generated'],
};

const icons: Record<string, any> = { folder: Folder, pdf: FileText, img: Image, zip: Archive };
const iconColors: Record<string, string> = { folder: '#4285F4', pdf: '#EA4335', img: '#34A853', zip: '#FBBC04' };

export function FinderLayout() {
  const [selected, setSelected] = useState<{ col: number; item: string }>({ col: 2, item: 'Elsiddig_Ibrahim.pdf' });

  return (
    <div className="flex flex-col h-screen bg-[#f5f5f5] font-sans overflow-hidden">
      {/* Title bar */}
      <div className="bg-[#e8e8e8] border-b border-gray-300 px-4 py-2 flex items-center gap-3">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#FF5F57]" />
          <div className="w-3 h-3 rounded-full bg-[#FFBD2E]" />
          <div className="w-3 h-3 rounded-full bg-[#28C840]" />
        </div>
        <div className="flex-1 flex items-center justify-center gap-2">
          <span className="text-sm text-gray-600 font-medium">Profiles</span>
        </div>
        <div className="flex items-center gap-1 bg-white/70 rounded-md border border-gray-300 px-1">
          <button className="p-1 rounded text-gray-500 hover:bg-gray-200"><List className="w-3.5 h-3.5" /></button>
          <button className="p-1 rounded text-gray-500 hover:bg-gray-200"><Grid className="w-3.5 h-3.5" /></button>
          <button className="p-1 rounded bg-gray-200 text-gray-700"><Columns className="w-3.5 h-3.5" /></button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-[#ebebeb] border-b border-gray-300 px-4 py-1.5 flex items-center gap-2">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <span className="hover:underline cursor-pointer text-blue-600">My Drive</span>
          <ChevronRight className="w-3 h-3" />
          <span className="hover:underline cursor-pointer text-blue-600">HR</span>
          <ChevronRight className="w-3 h-3" />
          <span className="hover:underline cursor-pointer text-blue-600">Profiles</span>
          <ChevronRight className="w-3 h-3" />
          <span className="text-gray-700 font-medium">{selected.item}</span>
        </div>
        <div className="ml-auto flex gap-2">
          <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Share2 className="w-3 h-3" /> Share</button>
          <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Download className="w-3 h-3" /> Download</button>
          <button className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><Tag className="w-3 h-3" /> Tag</button>
        </div>
      </div>

      {/* Column view */}
      <div className="flex-1 flex overflow-hidden">
        {columns.map((col, ci) => (
          <div key={col.id} className="w-52 shrink-0 border-r border-gray-300 bg-white overflow-y-auto">
            <div className="sticky top-0 bg-[#f0f0f0] border-b border-gray-200 px-3 py-1.5">
              <span className="text-xs font-semibold text-gray-500">{col.title}</span>
            </div>
            {col.items.map(item => {
              const Icon = icons[item.type] || File;
              const isSelected = selected.col === ci && selected.item === item.name;
              return (
                <button
                  key={item.name}
                  onClick={() => setSelected({ col: ci, item: item.name })}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 ${isSelected ? 'bg-blue-500 text-white' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" style={{ color: isSelected ? '#fff' : iconColors[item.type] }} />
                    <span className="text-xs truncate">{item.name}</span>
                  </div>
                  {item.type === 'folder' && <ChevronRight className={`w-3 h-3 shrink-0 ${isSelected ? 'text-white' : 'text-gray-400'}`} />}
                </button>
              );
            })}
          </div>
        ))}

        {/* Preview panel */}
        <div className="flex-1 bg-[#f5f5f5] flex flex-col overflow-y-auto">
          {/* File preview */}
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="w-24 h-28 bg-white rounded-lg shadow-md flex items-center justify-center mb-4 border border-gray-200">
              <div className="text-center">
                <FileText className="w-10 h-10 text-red-500 mx-auto" />
                <div className="text-xs font-bold text-red-500 mt-1">PDF</div>
              </div>
            </div>
            <div className="text-sm font-semibold text-gray-800 mb-1 text-center">{preview.name}</div>
            <div className="flex gap-2 mt-2">
              <button className="flex items-center gap-1.5 text-xs bg-blue-500 text-white rounded-md px-3 py-1.5 hover:bg-blue-600">
                <Eye className="w-3 h-3" /> Quick Look
              </button>
              <button className="flex items-center gap-1.5 text-xs bg-white text-gray-700 border border-gray-300 rounded-md px-3 py-1.5 hover:bg-gray-50">
                <Download className="w-3 h-3" /> Download
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="border-t border-gray-300 bg-white p-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Info</div>
            <div className="space-y-2">
              {[
                ['Type', preview.type],
                ['Size', preview.size],
                ['Modified', preview.modified],
                ['Created', preview.created],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span className="text-xs text-gray-500">{k}</span>
                  <span className="text-xs text-gray-700 font-medium">{v}</span>
                </div>
              ))}
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tags</div>
              <div className="flex flex-wrap gap-1">
                {preview.tags.map(tag => (
                  <span key={tag} className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
